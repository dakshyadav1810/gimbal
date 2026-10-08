import type { RunReport, StepResult } from "@gimbal/shared";

// Run passes iff no step failed and >=1 step executed; stale sets needsReview (SPEC-003 §5, LLD-005 §7).
// testId is the artifact-store id the caller ran (RunRequest.testId) — NOT test.flow.id, which is the
// spec author's own free-text flow name and has no relationship to how the test is looked up or run
// again (LLD-010 run history surfaced this: listRuns(storeId) found nothing because saved runs were
// keyed by flow.id instead).
export function aggregate(
  runId: string,
  testId: string,
  results: StepResult[],
  startedAt: string,
): RunReport {
  const executed = results.filter((r) => r.status !== "skipped");
  const hasFailed = results.some(
    (r) => r.status === "failed" || r.status === "stale",
  );
  // Anything a person should look at: abstained steps, unverified heals, and heals that were used
  // (each leaves a repair proposal to accept or reject).
  const needsReview = results.some(
    (r) =>
      r.status === "stale" ||
      r.status === "warning" ||
      (r.status === "passed" && r.selection === "resolver"),
  );
  return {
    runId,
    testId,
    status: !hasFailed && executed.length > 0 ? "passed" : "failed",
    needsReview,
    steps: results,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
