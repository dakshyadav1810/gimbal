import type { Frame, Page } from "playwright";
import type { DomCandidate } from "../resolver/base.js";
import { extractInteractiveElementsInPage } from "./dom-extractor.js";

// Node-side wrapper: injects the typed in-page module, returns serializable DomCandidates (LLD-003 §4).
// Walks every frame (main + same-origin/cross-origin child iframes — Playwright's frame.evaluate()
// runs over CDP and isn't subject to the browser's same-origin JS restriction, verified empirically),
// tagging non-main-frame results with `frame` so execution/locate.ts can target them via
// page.frameLocator(...). ids stay unique across frames via a single running counter.
export async function extractCandidates(page: Page): Promise<DomCandidate[]> {
  const frames = page.frames();
  const out: DomCandidate[] = [];
  let counter = 0;

  const extractFrom = async (
    frame: Frame,
    frameMeta: DomCandidate["frame"],
  ) => {
    let raw: Awaited<ReturnType<typeof extractInteractiveElementsInPage>>;
    try {
      raw = await frame.evaluate(extractInteractiveElementsInPage);
    } catch {
      // Detached, cross-origin-blocked by an unusual CSP, or not yet navigated — skip, don't fail
      // the whole extraction pass over one uncooperative frame.
      return;
    }
    for (const r of raw) {
      out.push({
        id: `cand_${counter++}`,
        selector: r.cssSelector,
        tag: r.tag,
        role: r.role,
        label: r.label,
        disabled: r.disabled,
        visible: r.visible,
        focusable: r.focusable,
        clickable: r.clickable,
        boundingBox: r.boundingBox,
        ancestorChain: r.ancestorChain,
        region: r.region,
        nearbyText: r.nearbyText,
        controlledContent: r.controlledContent,
        testId: r.testId,
        attributes: r.attributes,
        xpath: r.xpath,
        contextPath: r.contextPath,
        siblingIndex: r.siblingIndex,
        parentXpath: r.parentXpath,
        spatialLabel: r.spatialLabel,
        insideVirtualizedContainer: r.insideVirtualizedContainer,
        ...(frameMeta ? { frame: frameMeta } : {}),
      });
    }
  };

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const isMain = frame === page.mainFrame();
    await extractFrom(frame, isMain ? undefined : { url: frame.url(), index: i });
  }

  return out;
}

// Stable identity for merging candidates seen across scroll passes — testId when present (most
// durable), else xpath (still stable across passes since it's computed from live sibling position,
// not from a re-generated counter like `id`).
function candidateIdentity(c: DomCandidate): string {
  return c.testId ? `testid:${c.testId}` : `xpath:${c.xpath ?? c.selector}`;
}

// Wraps extractCandidates with a bounded scroll-and-re-extract loop for virtualized/windowed lists,
// whose off-screen rows don't exist in the DOM at all until scrolled into view — no extraction fix
// alone helps, only actually scrolling does. Only pays the extra passes when at least one extracted
// element looks like it's inside a virtualized container (dom-extractor.ts's cheap heuristic);
// otherwise behaves exactly like a single extractCandidates() call. Each pass scrolls the nearest
// scrollable ancestor of the FIRST detected virtualized element by one viewport height and merges
// newly-seen candidates by stable identity, so the caller's resolver sees the union across passes.
export async function extractCandidatesWithScroll(
  page: Page,
  maxScrollPasses: number,
): Promise<DomCandidate[]> {
  let all = await extractCandidates(page);
  if (maxScrollPasses <= 0) return all;

  const seen = new Map(all.map((c) => [candidateIdentity(c), c]));
  let pass = 0;
  while (
    pass < maxScrollPasses &&
    Array.from(seen.values()).some((c) => c.insideVirtualizedContainer)
  ) {
    const scrolled = await page.evaluate(() => {
      const isScrollable = (el: HTMLElement): boolean => {
        const style = window.getComputedStyle(el);
        return (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight * 1.5
        );
      };
      // Find the first scrollable container that isn't already scrolled to its bottom.
      const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
      const container = all.find(
        (el) =>
          isScrollable(el) &&
          el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      );
      if (!container) return false;
      container.scrollTop += container.clientHeight;
      return true;
    });
    if (!scrolled) break; // nothing left to scroll — further passes would be wasted
    pass++;
    // The 'scroll' event (and any virtualized-list re-render it triggers) fires asynchronously —
    // give it a couple of frames to settle before re-extracting, or this reads the pre-scroll DOM.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const next = await extractCandidates(page);
    for (const c of next) seen.set(candidateIdentity(c), c);
  }

  all = Array.from(seen.values());
  return all;
}
