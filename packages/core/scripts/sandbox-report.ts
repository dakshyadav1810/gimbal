// Thin CLI wrapper around the resolver sandbox harness.
//
// Run with: pnpm --filter @gimbal/core sandbox:report
// (or directly: tsx packages/core/scripts/sandbox-report.ts)
//
// Prints the same per-case band-accuracy table and aggregate stats that
// sandbox.test.ts asserts on, without wrapping it in vitest — useful for a
// quick manual look at where the resolver currently stands, and for eyeballing
// `.gimbal/sandbox-report.json` after a run.
import { runEvaluation } from "../src/resolver/sandbox/runner.js";

async function main() {
  const { results, success, successExcludingKnownGaps, aggregate } =
    await runEvaluation();

  const knownGapResults = results.filter((r) => r.isKnownGap);
  const nonKnownGapResults = results.filter((r) => !r.isKnownGap);

  console.log("### SANDBOX REPORT SUMMARY");
  console.log(`Total cases:                  ${aggregate.totalCases}`);
  console.log(`Non-known-gap cases:          ${nonKnownGapResults.length}`);
  const bySuite = (s: string) => results.filter((r) => r.suite === s);
  console.log(
    `Resolver suite: ${bySuite("resolver").filter((r) => r.passed).length}/${bySuite("resolver").length} pass | Flow suite: ${bySuite("flow").filter((r) => r.passed).length}/${bySuite("flow").length} pass`,
  );
  console.log(`Known-gap cases:              ${knownGapResults.length}`);
  console.log(
    `Non-located rate:             ${(aggregate.nonLocatedRate * 100).toFixed(1)}%`,
  );
  console.log(
    `False-positive rate:          ${(aggregate.falsePositiveRate * 100).toFixed(1)}%`,
  );
  console.log(`Success (all cases):           ${success}`);
  console.log(`Success (excluding known-gaps): ${successExcludingKnownGaps}`);

  if (knownGapResults.length > 0) {
    console.log("\n### KNOWN-GAP CASES (expected to fail until fixed)");
    for (const r of knownGapResults) {
      console.log(
        `- [${r.passed ? "PASS (fixed!)" : "fail"}] ${r.caseId}: ${r.name}`,
      );
    }
  }

  console.log("\nFull report written to .gimbal/sandbox-report.json");

  // Exit non-zero only on a regression in an established (non-known-gap) case — known-gap
  // cases are EXPECTED to fail until their capability lands, so they shouldn't fail CI usage
  // of this script. Use `success` (not just successExcludingKnownGaps) if you want this script
  // to also flag when a known-gap case has started passing (a signal to promote it out of the
  // known-gap list in cases.ts / sandbox.test.ts).
  //
  // Prefer exitCode over process.exit() here: the embedding runtime (onnxruntime) and other
  // native bindings spin up worker threads that need a chance to unwind on their own — calling
  // process.exit() immediately after they're done can abort mid-teardown and crash the process
  // with a native-level error instead of exiting cleanly.
  process.exitCode = successExcludingKnownGaps ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
