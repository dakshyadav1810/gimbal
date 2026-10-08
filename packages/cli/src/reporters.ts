import type { RunReport } from "@gimbal/shared";

export interface TestRun {
  testId: string;
  name: string;
  report: RunReport;
  seconds: number;
}

export type Outcome = "passed" | "failed" | "review";

// failed: a step failed. review: nothing failed, but a person should look (abstained step,
// unverified or used heal).
export function outcomeOf(r: RunReport): Outcome {
  if (r.steps.some((s) => s.status === "failed")) return "failed";
  if (r.status === "failed" || r.needsReview) return "review";
  return "passed";
}

export function exitCode(runs: TestRun[], strict: boolean): number {
  const outcomes = runs.map((r) => outcomeOf(r.report));
  if (outcomes.includes("failed")) return 1;
  if (outcomes.includes("review")) return strict ? 1 : 2;
  return 0;
}

export function summary(runs: TestRun[]): string {
  const n = (o: Outcome) =>
    runs.filter((r) => outcomeOf(r.report) === o).length;
  const secs = runs.reduce((a, r) => a + r.seconds, 0).toFixed(1);
  return `${runs.length} test${runs.length === 1 ? "" : "s"}: ${n("passed")} passed, ${n("failed")} failed, ${n("review")} need review (${secs}s)`;
}

const MARK = { passed: "PASS", failed: "FAIL", review: "REVIEW" } as const;

export function formatList(runs: TestRun[]): string {
  const lines: string[] = [];
  for (const r of runs) {
    const o = outcomeOf(r.report);
    lines.push(`${MARK[o]}  ${r.name} (${r.seconds.toFixed(1)}s)`);
    for (const s of r.report.steps) {
      if (s.status === "passed" && s.selection !== "resolver") continue;
      const why = s.failure?.message ?? s.note ?? "";
      lines.push(
        `      ${s.stepId}: ${s.status}${s.selection === "resolver" ? " (healed)" : ""}${why ? ` - ${why}` : ""}`,
      );
    }
  }
  lines.push("", summary(runs));
  return lines.join("\n");
}

export function formatJson(runs: TestRun[]): string {
  return JSON.stringify(
    {
      summary: summary(runs),
      tests: runs.map((r) => ({
        testId: r.testId,
        name: r.name,
        outcome: outcomeOf(r.report),
        seconds: r.seconds,
        report: r.report,
      })),
    },
    null,
    2,
  );
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// JUnit has no "needs review"; it is reported as skipped so CI shows it without failing the build.
export function formatJunit(runs: TestRun[]): string {
  const failures = runs.filter((r) => outcomeOf(r.report) === "failed").length;
  const skipped = runs.filter((r) => outcomeOf(r.report) === "review").length;
  const cases = runs
    .map((r) => {
      const o = outcomeOf(r.report);
      const detail = r.report.steps
        .filter((s) => s.status !== "passed" || s.selection === "resolver")
        .map((s) =>
          `${s.stepId}: ${s.status} ${s.failure?.message ?? s.note ?? ""}`.trim(),
        )
        .join("\n");
      const body =
        o === "failed"
          ? `<failure message="${esc(r.report.steps.find((s) => s.status === "failed")?.failure?.message ?? "step failed")}">${esc(detail)}</failure>`
          : o === "review"
            ? `<skipped message="needs review">${esc(detail)}</skipped>`
            : "";
      return `    <testcase name="${esc(r.name)}" classname="gimbal" time="${r.seconds.toFixed(3)}">${body}</testcase>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="gimbal" tests="${runs.length}" failures="${failures}" skipped="${skipped}">\n${cases}\n</testsuite>`;
}

export const REPORTERS = {
  list: formatList,
  json: formatJson,
  junit: formatJunit,
};
