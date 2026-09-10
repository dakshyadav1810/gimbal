import type { Band, Candidate, GroundedTest } from "@gimbal/shared";
import type { Page } from "playwright";
import type { CacheStore } from "../cache/index.js";
import { accept } from "../grounding/gate.js";
import type { GroundingService } from "../grounding/index.js";
import { audit } from "./audit.js";
import { enqueue } from "./review.js";

export type HealOutcome =
  | {
      status: "healed";
      cachedSelector: string;
      band: Band;
      from: string | null;
    }
  | { status: "stale"; reason: string; topCandidates: Candidate[] };

// Deterministic, LLM-free. Called by execution on a cached-selector miss (LLD-006 §3).
// Bounded: one re-ground attempt per step per call — no indefinite looping.
export async function runtimeHeal(
  grounding: GroundingService,
  cache: CacheStore,
  test: GroundedTest,
  stepId: string,
  page: Page,
  previousSelector: string | null,
  storeTestId: string,
): Promise<HealOutcome> {
  const result = await grounding.reground(test, stepId, page);

  // Bounded healing: prevent cross-container drift (e.g. leaking outside an open modal)
  const step = test.steps.find((s) => s.id === stepId);
  const originalWinner =
    step?.kind === "ui" ? step.target?.resolution?.winner : undefined;
  const originalRegion = originalWinner?.region;
  const healedCandidate = result.resolution.candidates.find(
    (c) => c.id === result.resolution.selected,
  );
  const crossContainerDrift =
    Boolean(originalRegion === "modal" && healedCandidate && healedCandidate.region !== "modal");

  if (accept(result.band) && result.cachedSelector && !crossContainerDrift) {
    // resolution_cache stays keyed by flow.id (see locate.ts) — only the review queue and audit
    // log, which are looked up by the storage-layer id elsewhere (verdict.ts), use storeTestId.
    cache.putSelector({
      testId: test.flow.id,
      stepId,
      domHash: result.domHash,
      cachedSelector: result.cachedSelector,
      band: result.band,
    });
    audit(cache, storeTestId, stepId, "healed", {
      from: previousSelector,
      to: result.cachedSelector,
      band: result.band,
    });
    return {
      status: "healed",
      cachedSelector: result.cachedSelector,
      band: result.band,
      from: previousSelector,
    };
  }

  const staleReason = crossContainerDrift
    ? "cross-container boundary drift: candidate outside original modal"
    : "no candidate reached medium confidence";

  const topCandidates = result.resolution.candidates.slice(0, 5);
  enqueue(cache, storeTestId, stepId, page.url(), topCandidates);
  audit(cache, storeTestId, stepId, "stale", {
    from: previousSelector,
    reason: staleReason,
  });
  return {
    status: "stale",
    reason: staleReason,
    topCandidates,
  };
}
