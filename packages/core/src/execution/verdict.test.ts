import type { StepResult } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import { aggregate } from "./verdict.js";

function step(overrides: Partial<StepResult> = {}): StepResult {
  return { stepId: "s1", status: "passed", durationMs: 10, ...overrides };
}

describe("aggregate", () => {
  it("passes when every step passed", () => {
    const report = aggregate(
      "r1",
      "t1",
      [step(), step({ stepId: "s2" })],
      "2026-07-28T00:00:00.000Z",
    );
    expect(report.status).toBe("passed");
    expect(report.needsReview).toBe(false);
  });

  it("fails when any step failed", () => {
    const report = aggregate(
      "r1",
      "t1",
      [step(), step({ stepId: "s2", status: "failed" })],
      "2026-07-28T00:00:00.000Z",
    );
    expect(report.status).toBe("failed");
  });

  it("fails and flags needsReview when a step is stale", () => {
    const report = aggregate(
      "r1",
      "t1",
      [step(), step({ stepId: "s2", status: "stale" })],
      "2026-07-28T00:00:00.000Z",
    );
    expect(report.status).toBe("failed");
    expect(report.needsReview).toBe(true);
  });

  it("fails when there are zero executed (non-skipped) steps, even with no failures", () => {
    const report = aggregate(
      "r1",
      "t1",
      [step({ status: "skipped" })],
      "2026-07-28T00:00:00.000Z",
    );
    expect(report.status).toBe("failed");
  });

  it("passes when skipped steps are mixed in among otherwise-passing steps", () => {
    const report = aggregate(
      "r1",
      "t1",
      [step({ status: "skipped" }), step({ stepId: "s2", status: "passed" })],
      "2026-07-28T00:00:00.000Z",
    );
    expect(report.status).toBe("passed");
  });

  it("keys the report by the passed-in testId (artifact-store id), not any field derived from steps", () => {
    const report = aggregate(
      "r1",
      "store-id-123",
      [step()],
      "2026-07-28T00:00:00.000Z",
    );
    expect(report.testId).toBe("store-id-123");
  });

  it("preserves the full steps array and startedAt, and stamps a finishedAt timestamp", () => {
    const steps = [step(), step({ stepId: "s2" })];
    const report = aggregate("r1", "t1", steps, "2026-07-28T00:00:00.000Z");
    expect(report.steps).toBe(steps);
    expect(report.startedAt).toBe("2026-07-28T00:00:00.000Z");
    expect(typeof report.finishedAt).toBe("string");
    expect(() => new Date(report.finishedAt)).not.toThrow();
  });
});
