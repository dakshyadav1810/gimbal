import type { RunReport } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import {
  type TestRun,
  exitCode,
  formatJunit,
  formatList,
  outcomeOf,
  summary,
} from "./reporters.js";

const run = (
  steps: RunReport["steps"],
  over: Partial<RunReport> = {},
): TestRun => ({
  testId: "t",
  name: "login <flow>",
  seconds: 1.5,
  report: {
    runId: "r",
    testId: "t",
    status: "passed",
    needsReview: false,
    steps,
    startedAt: "",
    finishedAt: "",
    ...over,
  },
});
const step = (status: RunReport["steps"][number]["status"], extra = {}) => ({
  stepId: "s1",
  status,
  durationMs: 1,
  ...extra,
});

describe("reporters", () => {
  const pass = run([step("passed")]);
  const fail = run(
    [step("failed", { failure: { reason: "X", message: "boom" } })],
    { status: "failed" },
  );
  const review = run([step("stale")], { status: "failed", needsReview: true });
  const healed = run([step("passed", { selection: "resolver" })], {
    needsReview: true,
  });

  it("classifies outcomes", () => {
    expect(outcomeOf(pass.report)).toBe("passed");
    expect(outcomeOf(fail.report)).toBe("failed");
    expect(outcomeOf(review.report)).toBe("review");
    expect(outcomeOf(healed.report)).toBe("review");
  });

  it("exit codes: 0 pass, 1 fail, 2 review, strict turns 2 into 1", () => {
    expect(exitCode([pass], false)).toBe(0);
    expect(exitCode([pass, fail], false)).toBe(1);
    expect(exitCode([pass, review], false)).toBe(2);
    expect(exitCode([pass, review], true)).toBe(1);
  });

  it("summary line counts each outcome", () => {
    expect(summary([pass, fail, review])).toBe(
      "3 tests: 1 passed, 1 failed, 1 need review (4.5s)",
    );
  });

  it("list shows only the steps that need attention", () => {
    const out = formatList([healed, fail]);
    expect(out).toContain("REVIEW");
    expect(out).toContain("s1: passed (healed)");
    expect(out).toContain("boom");
  });

  it("junit escapes names and marks review as skipped", () => {
    const xml = formatJunit([pass, fail, review]);
    expect(xml).toContain('name="login &lt;flow&gt;"');
    expect(xml).toContain('failures="1" skipped="1"');
    expect(xml).toContain("<skipped");
  });
});
