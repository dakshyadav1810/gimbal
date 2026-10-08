import { describe, expect, it } from "vitest";
import { sandboxCases } from "./cases.js";
import { runEvaluation } from "./runner.js";

// Known-gap case IDs documented in cases.ts (tags: ["known-gap", ...]). Each
// records the CORRECT real-world expectedWinnerId/expectedBand for a
// capability that does not exist in packages/core/src yet — these are
// expected to fail today. As each capability lands in a later phase, move
// its id out of this list and it becomes a real regression assertion via
// the "no regression on established cases" test below.
const KNOWN_GAP_CASE_IDS = sandboxCases
  .filter((c) => (c.tags ?? []).includes("known-gap"))
  .map((c) => c.id);

describe("Resolver Sandbox Evaluation Suite", () => {
  it("no regression on established (non-known-gap) cases", async () => {
    const { results, successExcludingKnownGaps } = await runEvaluation();

    for (const r of results) {
      if (r.isKnownGap) continue;
      expect(r.selectedWinnerId, `Case "${r.caseId}" winner mismatch`).toBe(
        r.expectedWinnerId,
      );
      expect(r.band, `Case "${r.caseId}" band mismatch`).toBe(r.expectedBand);
    }

    expect(successExcludingKnownGaps).toBe(true);
  }, 40000); // Give embedding downloads/Playwright launch ample timeout margin

  // Known-gap regression checklist. Each of these documents a capability gap
  // (see cases.ts for the full description + expected "correct" answer once
  // fixed). Turn the matching entry into a real `it` (asserting winner/band)
  // as each capability lands — do not delete the checklist entry, promote it.
  describe.each(KNOWN_GAP_CASE_IDS)("known gap: %s", (caseId) => {
    const c = sandboxCases.find((sc) => sc.id === caseId)!;
    it.todo(`${caseId}: ${c.description}`);
  });
});
