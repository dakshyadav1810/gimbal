import type {
  Band,
  Candidate,
  GroundedTest,
  RepairLocation,
} from "@gimbal/shared";
import type { Page } from "playwright";
import type { CacheStore } from "../cache/index.js";
import { accept } from "../grounding/gate.js";
import type { GroundingService } from "../grounding/index.js";
import type { NewRepair, RepairStore } from "../repairs/store.js";
import { healAmbiguity } from "../resolver/banding.js";
import { lexicalSupport } from "../resolver/exact-name.js";
import { audit } from "./audit.js";

export type HealOutcome =
  | {
      status: "healed";
      cachedSelector: string;
      band: Band;
      from: string | null;
      domHash: string;
      // Not persisted yet: the caller writes it (and the selector cache) only after the healed
      // action has been verified, so a wrong heal never leaves a trace that later runs trust.
      proposal: NewRepair;
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
  repairs: RepairStore,
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
  const crossContainerDrift = Boolean(
    originalRegion === "modal" &&
      healedCandidate &&
      healedCandidate.region !== "modal",
  );

  const spec = step?.kind === "ui" ? step.target : undefined;
  const ambiguity =
    healAmbiguity(result.resolution.candidates, result.resolution.selected) ??
    (spec && healedCandidate && !lexicalSupport(spec, healedCandidate.label)
      ? `"${healedCandidate.label}" shares no words with "${spec.label}" or its listed synonyms`
      : null);

  // A selector the reviewer already rejected for this step must not come back as a fresh proposal.
  const rejected = (await repairs.list(storeTestId)).some(
    (r) =>
      r.stepId === stepId &&
      r.status === "rejected" &&
      r.after?.selector === result.cachedSelector,
  );
  const before: RepairLocation = {
    selector: previousSelector ?? "",
    label: originalWinner?.label,
    role: originalWinner?.role,
    region: originalRegion ?? null,
    contextPath: originalWinner?.anchors?.contextPath,
  };

  if (
    accept(result.band) &&
    result.cachedSelector &&
    !crossContainerDrift &&
    !rejected &&
    !ambiguity
  ) {
    const runnerUp = result.resolution.candidates.find(
      (c) => c.id !== result.resolution.selected,
    );
    const proposal: NewRepair = {
      testId: storeTestId,
      stepId,
      kind: "heal",
      status: "proposed",
      before,
      after: {
        selector: result.cachedSelector,
        label: healedCandidate?.label,
        role: healedCandidate?.role,
        region: healedCandidate?.region ?? null,
        contextPath: healedCandidate?.anchors?.contextPath,
        frame: healedCandidate?.frame,
      },
      evidence: {
        confidence: result.resolution.confidence,
        band: result.band,
        signals: { ...(healedCandidate?.signals ?? {}) },
        runnerUp: runnerUp
          ? { label: runnerUp.label, score: runnerUp.score }
          : undefined,
      },
    };
    return {
      status: "healed",
      cachedSelector: result.cachedSelector,
      band: result.band,
      from: previousSelector,
      domHash: result.domHash,
      proposal,
    };
  }

  const staleReason = crossContainerDrift
    ? "cross-container boundary drift: candidate outside original modal"
    : rejected
      ? "best candidate was previously rejected by a reviewer"
      : ambiguity
        ? ambiguity
        : "no candidate reached medium confidence";

  const topCandidates = result.resolution.candidates.slice(0, 5);
  await repairs.add({
    testId: storeTestId,
    stepId,
    kind: "needed",
    status: "needed",
    before,
    reason: staleReason,
  });
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
