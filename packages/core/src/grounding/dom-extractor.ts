// Runs inside the page via page.evaluate(fn) — Playwright serializes ONLY this function's source,
// so every helper/const it needs must be declared inside it (no module-scope closures survive the trip).
export interface RawDomElement {
  tag: string;
  role?: string;
  label?: string;
  disabled: boolean;
  visible: boolean;
  focusable: boolean;
  clickable: boolean;
  boundingBox: { x: number; y: number; width: number; height: number };
  ancestorChain: string[];
  region: "form" | "modal" | "section" | null;
  nearbyText?: string;
  controlledContent?: string;
  testId?: string;
  attributes: Record<string, string>;
  xpath: string;
  contextPath: string[];
  siblingIndex: number;
  cssSelector: string;
  // Structurally-unique identity for the immediate parent (its own xpath), independent of whether
  // the parent has an id. contextPath[0] collapses to a bare tag name ("div") for any two unid'd
  // parents, which makes siblingIndex tiebreaks match unrelated elements that merely share a
  // common, anonymous ancestor tag (banding.ts).
  parentXpath: string | null;
  spatialLabel?: string; // nearest visible text node within the element's label quadrant
  insideVirtualizedContainer?: boolean;
}

export function extractInteractiveElementsInPage(): RawDomElement[] {
  const INTERACTIVE_SELECTOR =
    "button,a,input,select,textarea,[role=button],[role=link],[role=textbox],[role=checkbox],[role=radio],[role=menuitem],[role=tab],[tabindex],[onclick]";

  const els: HTMLElement[] = [];

  // Recursively traverse DOM, traversing into Shadow Roots
  const traverse = (root: ParentNode) => {
    const found = Array.from(
      root.querySelectorAll(INTERACTIVE_SELECTOR),
    ) as HTMLElement[];
    for (const el of found) {
      if (!els.includes(el)) els.push(el);
    }
    const all = root.querySelectorAll("*");
    for (const el of Array.from(all)) {
      const element = el as HTMLElement;
      if (element.shadowRoot) {
        traverse(element.shadowRoot);
      }
    }
  };

  traverse(document);

  // Filters [aria-hidden="true"] descendants out of a content-based name computation — a name
  // sourced from visible textContent shouldn't include text the AX tree itself hides.
  const visibleTextContent = (el: HTMLElement): string => {
    if (!el.querySelector('[aria-hidden="true"]')) {
      return el.textContent?.trim() ?? "";
    }
    const clone = el.cloneNode(true) as HTMLElement;
    for (const n of Array.from(clone.querySelectorAll('[aria-hidden="true"]')))
      n.remove();
    return clone.textContent?.trim() ?? "";
  };

  // W3C AccName's aria-labelledby step is itself a full accessible-name computation on the
  // referenced element (aria-label, then ITS OWN aria-labelledby, then content) — not a flat
  // textContent read. Depth-capped so two elements aria-labelledby-ing each other can't recurse
  // forever.
  const resolveLabelledBy = (id: string, depth: number): string | undefined => {
    if (depth > 4) return undefined;
    const ref = document.getElementById(id);
    if (!ref) return undefined;
    const ownLabel = ref.getAttribute("aria-label");
    if (ownLabel?.trim()) return ownLabel.trim();
    const ownLabelledBy = ref.getAttribute("aria-labelledby");
    if (ownLabelledBy) {
      const nested = ownLabelledBy
        .split(/\s+/)
        .map((refId) => resolveLabelledBy(refId, depth + 1))
        .filter((t): t is string => Boolean(t));
      if (nested.length > 0) return nested.join(" ");
    }
    const text = visibleTextContent(ref);
    return text || undefined;
  };

  const accessibleName = (el: HTMLElement): string | undefined => {
    // 1. Explicit aria-label
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel?.trim()) return ariaLabel.trim();

    // 2. aria-labelledby (single or space-separated multi-ID) — recurses into each referenced
    // element's own accessible name (see resolveLabelledBy) rather than reading its textContent
    // directly, so a reference whose only name source is its OWN aria-label still resolves.
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => resolveLabelledBy(id, 0))
        .filter((t): t is string => Boolean(t));
      if (parts.length > 0) return parts.join(" ");
    }

    // 3. Associated <label for="id">
    if (el.id) {
      const forLabel = document.querySelector(
        `label[for="${CSS.escape(el.id)}"]`,
      );
      if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
    }

    // 4. Wrapped <label> without for attribute
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      for (const sub of Array.from(
        clone.querySelectorAll("input, select, textarea, button"),
      ))
        sub.remove();
      const labelText = clone.textContent?.trim();
      if (labelText) return labelText;
    }

    // 5. Input placeholder
    const placeholder = el.getAttribute("placeholder");
    if (placeholder?.trim()) return placeholder.trim();

    // 6. Title attribute
    const title = el.getAttribute("title");
    if (title?.trim()) return title.trim();

    // 7. For non-input elements, inner textContent (excluding aria-hidden descendants)
    const tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea" && tag !== "select") {
      const text = visibleTextContent(el);
      if (text) return text;
    }

    // 8. Fallback for Icon buttons / SVGs / IMGs inside interactive elements
    const svg =
      el.tagName.toLowerCase() === "svg" ? el : el.querySelector("svg");
    if (svg) {
      const svgAriaLabel = svg.getAttribute("aria-label");
      if (svgAriaLabel?.trim()) return svgAriaLabel.trim();
      const svgTitle =
        svg.querySelector("title")?.textContent?.trim() ||
        svg.getAttribute("title");
      if (svgTitle?.trim()) return svgTitle.trim();
    }

    const icon = el.querySelector("svg, img");
    if (icon) {
      const iconAriaLabel = icon.getAttribute("aria-label");
      if (iconAriaLabel?.trim()) return iconAriaLabel.trim();
      const iconTitle =
        icon.getAttribute("title") ||
        icon.querySelector("title")?.textContent?.trim();
      if (iconTitle?.trim()) return iconTitle.trim();
      const iconAlt = icon.getAttribute("alt");
      if (iconAlt?.trim()) return iconAlt.trim();
    }
    return undefined;
  };

  const VOLATILE_ID_PATTERNS = [
    /^:r[0-9a-zA-Z_-]+:$/,
    /^:R[0-9a-zA-Z_-]+:$/,
    /^[0-9a-f]{8}-[0-9a-f]{4}-/,
    /^css-[0-9a-zA-Z]+$/,
    /^radix-[0-9a-zA-Z-]+$/,
  ];
  const isVolatileId = (id: string): boolean =>
    VOLATILE_ID_PATTERNS.some((p) => p.test(id));

  // XPath has no native escape function; a value containing `"` would otherwise terminate the
  // string literal early, so quote-mixed values fall back to concat().
  const xpathLiteral = (value: string): string => {
    if (!value.includes('"')) return `"${value}"`;
    if (!value.includes("'")) return `'${value}'`;
    return `concat(${value
      .split('"')
      .map((part) => `"${part}"`)
      .join(`, '"', `)})`;
  };

  const xpathFor = (el: HTMLElement): string => {
    if (el.id && !isVolatileId(el.id)) return `//*[@id=${xpathLiteral(el.id)}]`;
    const parts: string[] = [];
    let node: Node | null = el;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      let index = 1;
      let sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === element.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(`${element.tagName.toLowerCase()}[${index}]`);
      node =
        element.parentElement ||
        (element.parentNode?.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ? (element.parentNode as ShadowRoot).host
          : null);
    }
    return `/${parts.join("/")}`;
  };

  const contextPathFor = (el: HTMLElement): string[] => {
    const path: string[] = [];
    let node: Node | null =
      el.parentElement ||
      (el.parentNode?.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? (el.parentNode as ShadowRoot).host
        : null);
    let depth = 0;
    while (node && depth < 5 && node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      path.push(
        element.tagName.toLowerCase() +
          (element.id && !isVolatileId(element.id)
            ? `#${CSS.escape(element.id)}`
            : ""),
      );
      node =
        element.parentElement ||
        (element.parentNode?.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ? (element.parentNode as ShadowRoot).host
          : null);
      depth++;
    }
    return path;
  };

  // aria-controls/aria-owns can reference content that's mounted-but-hidden (display:none) rather
  // than absent — reading it doesn't require opening the trigger, unlike content that's only
  // conditionally rendered on click. Absent/unmounted targets simply yield no signal.
  const controlledContentFor = (el: HTMLElement): string | undefined => {
    const ref =
      el.getAttribute("aria-controls") ?? el.getAttribute("aria-owns");
    if (!ref) return undefined;
    const text = ref
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter((t): t is string => Boolean(t))
      .join(" ")
      .slice(0, 200);
    return text || undefined;
  };

  const regionFor = (el: HTMLElement): "form" | "modal" | "section" | null => {
    if (el.closest('[role="dialog"], .modal, dialog')) return "modal";
    if (el.closest("form")) return "form";
    if (el.closest("section")) return "section";
    return null;
  };

  // Cheap, purely informational heuristic — NOT a resolver-scored signal — feeding
  // grounding/candidate.ts's scroll-and-re-extract decision for windowed/virtualized lists (react-
  // window, react-virtualized, TanStack Virtual, cdk-virtual-scroll-viewport, ...). A false positive
  // just costs a few wasted scroll passes; a false negative just skips scrolling.
  const insideVirtualizedContainer = (el: HTMLElement): boolean => {
    let node: HTMLElement | null = el;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      const cls = typeof node.className === "string" ? node.className : "";
      if (
        /virtual|react-window|react-virtualized|cdk-virtual-scroll/i.test(
          cls,
        ) ||
        node.hasAttribute("data-virtualized") ||
        node.hasAttribute("cdk-virtual-scroll-viewport")
      ) {
        return true;
      }
      const style = window.getComputedStyle(node);
      const scrollable =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight * 3;
      if (scrollable) return true;
    }
    return false;
  };

  const isUniqueCss = (sel: string): boolean => {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  };

  const cssSelectorFor = (el: HTMLElement): string => {
    // 1. Non-volatile ID
    if (el.id && !isVolatileId(el.id)) {
      const idSel = `#${CSS.escape(el.id)}`;
      if (isUniqueCss(idSel)) return idSel;
    }

    // 2. data-testid
    const testId = el.getAttribute("data-testid");
    if (testId) {
      const testIdSel = `[data-testid="${CSS.escape(testId)}"]`;
      if (isUniqueCss(testIdSel)) return testIdSel;
    }

    const tag = el.tagName.toLowerCase();

    // 3. tag[name]
    const nameAttr = el.getAttribute("name");
    if (nameAttr) {
      const nameSel = `${tag}[name="${CSS.escape(nameAttr)}"]`;
      if (isUniqueCss(nameSel)) return nameSel;

      // Compound with parent form if form has name/id
      const form = el.closest("form");
      if (form) {
        if (form.id && !isVolatileId(form.id)) {
          const compound = `#${CSS.escape(form.id)} ${nameSel}`;
          if (isUniqueCss(compound)) return compound;
        }
        const formName = form.getAttribute("name");
        if (formName) {
          const compound = `form[name="${CSS.escape(formName)}"] ${nameSel}`;
          if (isUniqueCss(compound)) return compound;
        }
      }
    }

    // 4. placeholder
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) {
      const placeholderSel = `${tag}[placeholder="${CSS.escape(placeholder)}"]`;
      if (isUniqueCss(placeholderSel)) return placeholderSel;
    }

    // 5. aria-label
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
      const ariaSel = `${tag}[aria-label="${CSS.escape(ariaLabel)}"]`;
      if (isUniqueCss(ariaSel)) return ariaSel;
    }

    // 6. input[type='...'] ONLY if unique
    const type = el.getAttribute("type");
    if (tag === "input" && type) {
      const typeSel = `input[type='${CSS.escape(type)}']`;
      if (isUniqueCss(typeSel)) return typeSel;

      const form = el.closest("form");
      if (form) {
        if (form.id && !isVolatileId(form.id)) {
          const compound = `#${CSS.escape(form.id)} ${typeSel}`;
          if (isUniqueCss(compound)) return compound;
        }
      }
    }

    // 7. Guaranteed fallback: unique positional XPath
    return `xpath=${xpathFor(el)}`;
  };

  const getNearbyText = (element: HTMLElement): string => {
    const STOP_TAGS = [
      "form",
      "section",
      "tr",
      "li",
      "ul",
      "ol",
      "header",
      "footer",
      "article",
      "aside",
      "nav",
    ];
    // Common single-field/single-item wrapper keywords — without these, traversal climbs PAST the
    // correctly-scoped per-item container (e.g. a <div class="field"> wrapping one labeled input)
    // into a shared ancestor (e.g. the enclosing <form>), returning identical nearbyText for every
    // sibling field and destroying the exact differentiation this function exists to provide.
    const STOP_KEYWORDS = [
      "row",
      "card",
      "section",
      "item",
      "field",
      "form-group",
      "input-group",
      "control",
    ];
    let curr: HTMLElement | null = element;
    let depth = 0;
    while (curr && depth < 3) {
      const parent: HTMLElement | null = curr.parentElement;
      if (parent) {
        if (parent.tagName === "BODY" || parent.tagName === "HTML") {
          break;
        }
        curr = parent;
        depth++;

        const tag = curr.tagName.toLowerCase();
        const id = curr.id ? curr.id.toLowerCase() : "";
        const cls =
          typeof curr.className === "string"
            ? curr.className.toLowerCase()
            : "";

        // Stop traversing once we reach a row/card/section/field/form container — its own text is
        // the right scope; climbing further would blend in sibling items' text too.
        if (
          STOP_TAGS.includes(tag) ||
          STOP_KEYWORDS.some((k) => id.includes(k) || cls.includes(k))
        ) {
          break;
        }
      } else {
        break;
      }
    }
    return curr?.textContent?.trim().slice(0, 200) ?? "";
  };

  const spatialLabelFor = (element: HTMLElement): string | undefined => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return undefined;
    const SEARCH_RADIUS = 64;
    const candidates: { text: string; dist: number }[] = [];

    const elementCx = rect.x + rect.width / 2;
    const elementCy = rect.y + rect.height / 2;

    let node: HTMLElement | null = element.parentElement;
    let depth = 0;
    while (node && depth < 3) {
      for (const child of Array.from(node.children)) {
        const childEl = child as HTMLElement;
        if (childEl === element) continue;
        const text = childEl.textContent?.trim();
        if (!text || text.length > 80 || text.length === 0) continue;
        const cr = childEl.getBoundingClientRect();
        if (cr.width === 0 || cr.height === 0) continue;
        const cx = cr.x + cr.width / 2;
        const cy = cr.y + cr.height / 2;
        const isAbove =
          cr.y + cr.height <= rect.y + SEARCH_RADIUS &&
          cr.y + cr.height > rect.y - SEARCH_RADIUS;
        const isLeft =
          cr.x + cr.width <= rect.x + SEARCH_RADIUS &&
          cr.x + cr.width > rect.x - SEARCH_RADIUS;
        if (!isAbove && !isLeft) continue;
        const dist = Math.sqrt((cx - elementCx) ** 2 + (cy - elementCy) ** 2);
        if (dist <= SEARCH_RADIUS * 2) {
          candidates.push({ text, dist });
        }
      }
      node = node.parentElement;
      depth++;
    }

    if (candidates.length === 0) return undefined;
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0].text.slice(0, 80);
  };

  const isElementVisible = (el: HTMLElement): boolean => {
    if (
      el.getAttribute("aria-hidden") === "true" ||
      Boolean(el.closest?.('[aria-hidden="true"]'))
    ) {
      return false;
    }
    if (el.hasAttribute("hidden") || Boolean(el.closest?.("[hidden]"))) {
      return false;
    }
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    if (
      el.closest?.(
        '[style*="display:none"], [style*="display: none"], [style*="visibility:hidden"], [style*="visibility: hidden"]',
      )
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }
    return true;
  };

  return els.filter(isElementVisible).map((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const visible =
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0;

    const parentNode =
      el.parentElement ||
      (el.parentNode?.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? el.parentNode
        : null);
    const siblings = parentNode
      ? Array.from(parentNode.children ?? []).filter(
          (s) => s.tagName === el.tagName,
        )
      : [el];

    const attributes: Record<string, string> = {};
    // Allow-list: artifacts are committed, so never copy `value`/`checked`/free-form data-* (D4).
    // The resolver only reads id/name/type; the rest is identity-ish metadata.
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (
        n === "value" ||
        !(
          n === "id" ||
          n === "name" ||
          n === "type" ||
          n === "role" ||
          n === "data-testid" ||
          n === "placeholder" ||
          n === "title" ||
          n === "alt" ||
          n === "for" ||
          n === "href" ||
          (n.startsWith("aria-") &&
            n !== "aria-valuenow" &&
            n !== "aria-valuetext")
        )
      )
        continue;
      // Drop query/hash from hrefs: they routinely carry tokens and ids.
      attributes[attr.name] =
        n === "href" ? attr.value.split(/[?#]/)[0] : attr.value;
    }

    const parentXpath = el.parentElement
      ? xpathFor(el.parentElement)
      : el.parentNode?.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? xpathFor((el.parentNode as ShadowRoot).host as HTMLElement)
        : null;

    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") ?? undefined,
      label: accessibleName(el),
      disabled:
        (el as HTMLInputElement).disabled === true ||
        el.getAttribute("aria-disabled") === "true",
      visible,
      focusable: el.tabIndex >= 0,
      clickable: true,
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      ancestorChain: contextPathFor(el),
      region: regionFor(el),
      nearbyText: getNearbyText(el),
      controlledContent: controlledContentFor(el),
      testId: el.getAttribute("data-testid") ?? undefined,
      attributes,
      xpath: xpathFor(el),
      contextPath: contextPathFor(el),
      siblingIndex: siblings.indexOf(el),
      cssSelector: cssSelectorFor(el),
      parentXpath,
      spatialLabel: spatialLabelFor(el),
      insideVirtualizedContainer: insideVirtualizedContainer(el),
    };
  });
}
