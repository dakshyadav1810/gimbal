import { describe, expect, it } from "vitest";
import { runEvaluation } from "./runner.js";

describe("Resolver Sandbox Evaluation Suite", () => {
  it("resolves all evaluation scenarios correctly with expected bands", async () => {
    const { results, success } = await runEvaluation();
    
    for (const r of results) {
      expect(r.selectedWinnerId, `Case "${r.caseId}" winner mismatch`).toBe(r.expectedWinnerId);
      expect(r.band, `Case "${r.caseId}" band mismatch`).toBe(r.expectedBand);
    }
    
    expect(success).toBe(true);
  }, 40000); // Give embedding downloads/Playwright launch ample timeout margin
});
