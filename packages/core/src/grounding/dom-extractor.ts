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

  const accessibleName = (el: HTMLElement): string | undefined => {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel;
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const target = document.getElementById(labelledBy);
      if (target?.textContent) return target.textContent.trim();
    }
    if (el.id) {
      const forLabel = document.querySelector(
        `label[for="${CSS.escape(el.id)}"]`,
      );
      if (forLabel?.textContent) return forLabel.textContent.trim();
    }
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) return placeholder;
    const title = el.getAttribute("title");
    if (title) return title;
    const text = el.textContent?.trim();
    if (text) return text;

    // Fallback for Icon buttons / SVGs / IMGs inside interactive elements
    const icon = el.querySelector("svg, img");
    if (icon) {
      const iconAriaLabel = icon.getAttribute("aria-label");
      if (iconAriaLabel) return iconAriaLabel;
      const iconTitle =
        icon.getAttribute("title") ||
        icon.querySelector("title")?.textContent?.trim();
      if (iconTitle) return iconTitle;
      const iconAlt = icon.getAttribute("alt");
      if (iconAlt) return iconAlt;
    }
    return undefined;
  };

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
    if (el.id) return `//*[@id=${xpathLiteral(el.id)}]`;
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
          ? (element.parentNode as any).host
          : null);
    }
    return `/${parts.join("/")}`;
  };

  const contextPathFor = (el: HTMLElement): string[] => {
    const path: string[] = [];
    let node: Node | null =
      el.parentElement ||
      (el.parentNode?.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? (el.parentNode as any).host
        : null);
    let depth = 0;
    while (node && depth < 5 && node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      path.push(
        element.tagName.toLowerCase() +
          (element.id ? `#${CSS.escape(element.id)}` : ""),
      );
      node =
        element.parentElement ||
        (element.parentNode?.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ? (element.parentNode as any).host
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

  const cssSelectorFor = (el: HTMLElement): string => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const testId = el.getAttribute("data-testid");
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type");
    if (tag === "input" && type) return `input[type='${CSS.escape(type)}']`;
    // Playwright only auto-detects XPath when it starts with `//` or `..`; xpathFor() emits a
    // single leading slash, so it must be tagged explicitly or it parses as CSS and throws.
    return `xpath=${xpathFor(el)}`;
  };

  const getNearbyText = (element: HTMLElement): string => {
    const STOP_TAGS = ["form", "section", "tr", "li", "ul", "ol", "header", "footer", "article", "aside", "nav"];
    let node: HTMLElement | null = element;
    let depth = 0;
    while (node && depth < 3) {
      if (node.parentElement) {
        const parent = node.parentElement;
        if (parent.tagName === "BODY" || parent.tagName === "HTML") {
          break;
        }
        node = parent;
        depth++;
        
        const tag = node.tagName.toLowerCase();
        const id = node.id.toLowerCase();
        const cls = node.className.toLowerCase();
        
        // Stop traversing if we hit a row, card, section, or form container
        if (
          STOP_TAGS.includes(tag) ||
          id.includes("row") || id.includes("card") || id.includes("section") || id.includes("item") ||
          cls.includes("row") || cls.includes("card") || cls.includes("section") || cls.includes("item")
        ) {
          break;
        }
      } else {
        break;
      }
    }
    return node.textContent?.trim().slice(0, 200) ?? "";
  };

  return els.map((el) => {
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
    for (const attr of Array.from(el.attributes))
      attributes[attr.name] = attr.value;

    const parentXpath = el.parentElement
      ? xpathFor(el.parentElement)
      : el.parentNode?.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? xpathFor((el.parentNode as any).host)
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
    };
  });
}
