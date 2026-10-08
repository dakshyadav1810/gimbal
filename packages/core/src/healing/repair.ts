import type { GroundedTest, RepairPayload, SpecIR } from "@gimbal/shared";
import type { AuthoringService } from "../authoring/index.js";
import type { GroundingService } from "../grounding/index.js";
import type { ArtifactStore } from "../storage/index.js";

export interface RepairResult {
  testId: string;
  before: GroundedTest;
  after: GroundedTest;
  // Present when the scoped re-ground had to redo every step; says why.
  fellBackToFull?: string;
}

export async function buildRepairPayload(
  store: ArtifactStore,
  testId: string,
): Promise<RepairPayload> {
  const specIR = await store.loadSpec(testId);
  const testCase = await store.loadGrounded(testId);
  return { specIR, testCase, kdg: null };
}

// One path: the agent read buildRepairPayload via the MCP `healing` tool, re-authored the affected
// Tier-1 target(s) itself, and submits the result here. Core never re-authors anything (LLD-006 §6).
export async function maintain(
  authoring: AuthoringService,
  grounding: GroundingService,
  store: ArtifactStore,
  testId: string,
  stepIds: string[],
  patchedSpec: SpecIR,
): Promise<RepairResult> {
  const before = await store.loadGrounded(testId);
  const spec = await authoring.submit(patchedSpec);
  // Only the patched steps need the resolver; everything else replays from its stored selector.
  const outcome = await grounding.ground(spec, {
    only: stepIds,
    previous: before,
  });
  // Persist everything: the patched spec is the durable repair; without it the next run
  // re-reads the old spec.json and the repair is lost (D1).
  await store.saveSpec(spec, testId);
  await store.saveGrounded(testId, outcome.grounded);
  if (outcome.candidates) {
    // A scoped ground only resolved the patched steps; keep the earlier candidates for the rest.
    const old = await store.loadCandidates(testId);
    const have = new Set(outcome.candidates.steps.map((s) => s.stepId));
    const kept = (old?.steps ?? []).filter(
      (s) => !have.has(s.stepId) && spec.steps.some((x) => x.id === s.stepId),
    );
    await store.saveCandidates(testId, {
      ...outcome.candidates,
      steps: [...outcome.candidates.steps, ...kept],
    });
  }
  if (outcome.ariaSnapshot)
    await store.saveAriaSnapshot(testId, outcome.ariaSnapshot);
  return {
    testId,
    before,
    after: outcome.grounded,
    ...(outcome.fellBackToFull
      ? { fellBackToFull: outcome.fellBackToFull }
      : {}),
  };
}
