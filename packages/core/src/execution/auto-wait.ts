import type { GimbalConfig, GroundedTest, GroundedUiStep } from "@gimbal/shared";
import type { Page } from "playwright";
import type { CacheStore } from "../cache/index.js";
import type { HealingService } from "../healing/index.js";
import { locate, type LocateResult } from "./locate.js";

const POLL_MS = 100;
const STABILITY_DELTA_PX = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Retrieve the bounding box of the element matched by `selector` via page.evaluate so we
// get layout coordinates in the page's coordinate space, not Playwright's internal model.
async function getBoundingBox(
  page: Page,
  selector: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    return await page.evaluate((sel: string) => {
      let el: Element | null;
      if (sel.startsWith("xpath=")) {
        const res = document.evaluate(
          sel.slice(6),
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        el = res.singleNodeValue as Element | null;
      } else {
        el = document.querySelector(sel);
      }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, selector);
  } catch {
    return null;
  }
}

// Returns true when the element is the topmost (or an ancestor of the topmost) element at its
// own centre point — i.e. it is not occluded by a loading overlay or modal backdrop.
async function isNotOccluded(page: Page, selector: string): Promise<boolean> {
  try {
    return await page.evaluate((sel: string) => {
      let el: Element | null;
      if (sel.startsWith("xpath=")) {
        const res = document.evaluate(
          sel.slice(6),
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        el = res.singleNodeValue as Element | null;
      } else {
        el = document.querySelector(sel);
      }
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      if (!top) return false;
      // Accept if the topmost element IS the target or is a descendant of it.
      return el === top || el.contains(top);
    }, selector);
  } catch {
    return true; // evaluation error → be permissive rather than loop forever
  }
}

// 3-stage actionability gate wrapping the existing locate() function:
//
//   Stage 1 — DOM readiness:    poll locate() every 100ms until it resolves.
//   Stage 2 — Layout stability: verify bounding box is quiescent (Δ ≤ 1px over 100ms).
//   Stage 3 — Hit-test:         verify element is topmost at its own centre point.
//
// All three stages share a single deadline: config.timeouts.actionMs.
// On timeout or if the element disappears mid-wait, returns source "none".
export async function locateWithStabilityGate(
  test: GroundedTest,
  step: GroundedUiStep,
  page: Page,
  cache: CacheStore,
  healing: HealingService,
  storeTestId: string,
  config: GimbalConfig,
): Promise<LocateResult> {
  const deadline = Date.now() + config.timeouts.actionMs;
  const none: LocateResult = { locator: null, selector: null, source: "none" };

  // ── Stage 1: poll until locate() succeeds ────────────────────────────────
  let result: LocateResult = none;
  while (Date.now() < deadline) {
    result = await locate(test, step, page, cache, healing, storeTestId, config);
    if (result.locator !== null) break;
    await sleep(POLL_MS);
  }
  if (!result.locator || !result.selector) return none;

  // Auto-scroll gate: scroll element into view before measuring bounding box stability and hit testing
  if (typeof (result.locator as any).scrollIntoViewIfNeeded === "function") {
    await (result.locator as any).scrollIntoViewIfNeeded().catch(() => {});
  }

  const sel = result.selector;

  // ── Stage 2: layout stability ─────────────────────────────────────────────
  // Sample the bounding box twice, 100ms apart. If it moved, keep polling.
  while (Date.now() < deadline) {
    const box1 = await getBoundingBox(page, sel);
    if (!box1) return none; // element gone
    await sleep(POLL_MS);
    if (Date.now() >= deadline) return none;
    const box2 = await getBoundingBox(page, sel);
    if (!box2) return none;

    const stable =
      Math.abs(box2.x - box1.x) <= STABILITY_DELTA_PX &&
      Math.abs(box2.y - box1.y) <= STABILITY_DELTA_PX &&
      Math.abs(box2.width - box1.width) <= STABILITY_DELTA_PX &&
      Math.abs(box2.height - box1.height) <= STABILITY_DELTA_PX;

    if (stable) break;
    // still animating — wait another tick and re-check
  }
  if (Date.now() >= deadline) return none;

  // ── Stage 3: hit-test visibility ─────────────────────────────────────────
  // Element must be the topmost (un-occluded) node at its own centre.
  while (Date.now() < deadline) {
    if (await isNotOccluded(page, sel)) break;
    await sleep(POLL_MS);
  }
  if (Date.now() >= deadline) return none;

  return result;
}
