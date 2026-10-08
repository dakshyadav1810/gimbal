import type {
  GimbalConfig,
  GroundedTest,
  GroundedUiStep,
} from "@gimbal/shared";
import type { Locator, Page } from "playwright";
import type { CacheStore } from "../cache/index.js";
import { extractCandidatesWithScroll } from "../grounding/candidate.js";
import { computeDomHash } from "../grounding/dom-hash.js";
import type { Healed, HealingService } from "../healing/index.js";

export interface LocateResult {
  locator: Locator | null;
  selector: string | null;
  source: "cached" | "resolver" | "none";
  // Set when this selector came from a fresh runtime heal that still needs verifying.
  heal?: Healed;
}

async function isUniqueVisible(locator: Locator): Promise<boolean> {
  const count = await locator.count();
  if (count !== 1) return false;
  return locator.isVisible().catch(() => false);
}

// Scopes `selector` to the frame the winning candidate was extracted from, when set — matched by
// URL first (frame order can shift between grounding and execution), falling back to the captured
// index. Absent `frame` (the overwhelming majority of steps — same-document targets), behavior is
// unchanged: `page.locator(selector)` exactly as before this field existed.
function locatorFor(
  page: Page,
  selector: string,
  frame?: { url: string; index: number },
): Locator {
  if (!frame) return page.locator(selector);
  const frames = page.frames();
  const target =
    frames.find((f) => f.url() === frame.url) ?? frames[frame.index];
  return (target ?? page).locator(selector);
}

// Ladder: selector cache (by domHash) -> grounded-artifact selector -> runtime heal -> stale (LLD-005 §4).
export async function locate(
  test: GroundedTest,
  step: GroundedUiStep,
  page: Page,
  cache: CacheStore,
  healing: HealingService,
  storeTestId: string,
  config: GimbalConfig,
): Promise<LocateResult> {
  const domCandidates = await extractCandidatesWithScroll(
    page,
    config.maxScrollPasses,
  );
  const domHash = computeDomHash(domCandidates);
  // resolution_cache is deliberately keyed by flow.id, not storeTestId — see routes.ts's
  // clearSelectorsForTest(spec.flow.id) comment; that cache key must stay as-is.
  const testId = test.flow.id;

  const hit = cache.getSelector(testId, step.id, domHash);
  if (hit && (await isUniqueVisible(page.locator(hit.cachedSelector)))) {
    return {
      locator: page.locator(hit.cachedSelector),
      selector: hit.cachedSelector,
      source: "cached",
    };
  }

  const seed = step.target?.resolution?.cachedSelector;
  const seedFrame = step.target?.resolution?.winner?.frame;
  if (seed && (await isUniqueVisible(locatorFor(page, seed, seedFrame)))) {
    cache.putSelector({
      testId,
      stepId: step.id,
      domHash,
      cachedSelector: seed,
      band: step.target!.resolution!.band,
    });
    return {
      locator: locatorFor(page, seed, seedFrame),
      selector: seed,
      source: "cached",
    };
  }

  if (config.healing.mode === "off") {
    return { locator: null, selector: null, source: "none" };
  }

  // A proposal from an earlier run: reuse it even when cache.db was wiped, so the same heal isn't
  // recomputed (and possibly decided differently) on every fresh machine.
  const proposed = await healing.findProposal(storeTestId, step.id);
  if (proposed && (await isUniqueVisible(page.locator(proposed)))) {
    return {
      locator: page.locator(proposed),
      selector: proposed,
      source: "resolver",
    };
  }

  const outcome = await healing.runtimeHeal(
    test,
    step.id,
    page,
    seed ?? null,
    storeTestId,
  );
  if (outcome.status === "healed") {
    return {
      locator: page.locator(outcome.cachedSelector),
      selector: outcome.cachedSelector,
      source: "resolver",
      heal: outcome,
    };
  }
  return { locator: null, selector: null, source: "none" }; // -> STALE (SPEC-003 §7)
}
