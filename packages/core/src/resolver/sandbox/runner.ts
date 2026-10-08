import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GimbalConfig, GroundedTest } from "@gimbal/shared";
import fastify from "fastify";
import { type Browser, type Page, chromium } from "playwright";
import { buildContainer } from "../../server/container.js";
import { sandboxCases } from "./cases.js";

export interface EvaluationResult {
  caseId: string;
  name: string;
  selectedWinnerId: string | null;
  expectedWinnerId: string | null;
  band: string;
  expectedBand: string;
  passed: boolean;
  score: number;
  tags: string[];
  isKnownGap: boolean;
}

export interface AggregateReport {
  totalCases: number;
  nonLocatedRate: number;
  falsePositiveRate: number;
  successExcludingKnownGaps: boolean;
}

export async function runEvaluation(): Promise<{
  results: EvaluationResult[];
  success: boolean;
  successExcludingKnownGaps: boolean;
  aggregate: AggregateReport;
}> {
  const PORT = 31888;
  const server = fastify();
  let currentHtml = "";
  let currentFrameHtml = "";

  server.get("/case", async (req, reply) => {
    reply.type("text/html").send(currentHtml);
  });

  server.get("/case/frame", async (req, reply) => {
    reply.type("text/html").send(currentFrameHtml);
  });

  await server.listen({ port: PORT, host: "127.0.0.1" });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gimbal-sandbox-"));
  const config: GimbalConfig = {
    port: PORT,
    browser: "chromium",
    headless: true,
    dbPath: path.join(tempDir, "cache.db"),
    artifactsDir: path.join(tempDir, "tests"),
    screenshotsDir: path.join(tempDir, "screenshots"),
    fixturesDir: path.join(tempDir, "fixtures"),
    maxScrollPasses: 3,
    determinism: {},
    embeddingModel: "Xenova/all-MiniLM-L6-v2",
    embeddingRevision: "751bff37182d3f1213fa05d7196b954e230abad9",
    healing: { mode: "propose" },
    snapshotsDir: path.join(tempDir, "snapshots"),
    snapshots: "ground",
    bands: { high: 0.7, medium: 0.5 },
    timeouts: {
      actionMs: 5000,
      navMs: 10000,
      hydrationNetworkIdleMs: 2000,
      hydrationQuietWindowMs: 150,
    },
    db: { readOnly: true },
  };

  const container = buildContainer(config);
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page: Page = await context.newPage();

  // Workaround for a tsx/esbuild "keepNames" transform artifact: when this harness is invoked
  // via `tsx` (e.g. scripts/sandbox-report.ts) rather than vitest, esbuild's serialized output for
  // dom-extractor.ts's extractInteractiveElementsInPage() references a `__name(...)` helper that
  // only exists in the surrounding Node module scope — not inside the string that
  // page.evaluate() ships into the browser, so it throws "__name is not defined" there. This
  // in-page polyfill makes any such reference a no-op. It is a harness-only workaround (not a
  // resolver logic change) and is a harmless no-op under vitest, where this doesn't occur.
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as unknown as { __name?: unknown };
    w.__name = w.__name || ((fn: unknown) => fn);
  });

  const results: EvaluationResult[] = [];

  try {
    for (const c of sandboxCases) {
      currentHtml = c.html;
      currentFrameHtml = c.frameHtml ?? "";
      await page.goto(`http://127.0.0.1:${PORT}/case`);
      // Wait for any network/DOM rendering
      await page.waitForTimeout(200);

      if (c.preAction) {
        await c.preAction(page);
      }

      const mockTest: GroundedTest = {
        version: "1.0",
        groundedAt: new Date().toISOString(),
        groundedUrl: `http://127.0.0.1:${PORT}/case`,
        flow: {
          id: "sandbox-flow",
          name: "Sandbox Flow",
          intent: "evaluate resolver",
          startUrl: `http://127.0.0.1:${PORT}/case`,
          vars: {},
        },
        steps: [
          {
            id: "sandbox-step",
            kind: "ui",
            action: c.target.actions[0] as "click" | "type",
            intent: c.target.intent,
            onFailure: "abort",
            target: {
              ...c.target,
              resolution: undefined,
            },
            preconditions: [],
            assertions: [],
            negative: false,
            generalization: c.generalization ?? "same_element",
            expectedOutcome: [],
          },
        ],
      };

      const stepResolution = await container.grounding.reground(
        mockTest,
        "sandbox-step",
        page,
      );

      const winner = stepResolution.resolution.candidates.find(
        (cand) => cand.id === stepResolution.resolution.selected,
      );
      const selectedWinnerId = winner?.anchors?.attributes?.id ?? null;

      const isWinnerMatch = selectedWinnerId === c.expectedWinnerId;
      const isBandMatch = stepResolution.band === c.expectedBand;
      const passed = isWinnerMatch && isBandMatch;
      const tags = c.tags ?? [];

      results.push({
        caseId: c.id,
        name: c.name,
        selectedWinnerId,
        expectedWinnerId: c.expectedWinnerId,
        band: stepResolution.band,
        expectedBand: c.expectedBand,
        passed,
        score: winner?.score ?? 0,
        tags,
        isKnownGap: tags.includes("known-gap"),
      });
    }
  } finally {
    await browser.close();
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  // Print a beautiful Markdown summary table
  console.log("\n### RESOLVER SANDBOX EVALUATION SUMMARY REPORT");
  console.log(
    "| Case ID | Scenario Name | Selected Winner ID | Expected Winner ID | Band | Expected Band | Score | Status |",
  );
  console.log("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |");
  for (const r of results) {
    console.log(
      `| ${r.caseId} | ${r.name} | \`${r.selectedWinnerId ?? "none"}\` | \`${r.expectedWinnerId ?? "none"}\` | \`${r.band}\` | \`${r.expectedBand}\` | ${(r.score * 100).toFixed(0)}% | ${r.passed ? "✅ PASS" : "❌ FAIL"}${r.isKnownGap ? " (known-gap)" : ""} |`,
    );
  }
  console.log("\n");

  // A case is "non-located" when the resolver landed on low confidence (which the
  // resolver layer treats as "ungrounded", see resolver/index.ts:123) or picked no
  // winner at all.
  const nonLocated = results.filter(
    (r) => r.band === "low" || r.selectedWinnerId === null,
  );
  // A "false positive" is distinct from an honest low-confidence/ungrounded result:
  // the resolver was confident (medium/high band) but wrong about which element it picked.
  const falsePositives = results.filter(
    (r) => r.band !== "low" && r.selectedWinnerId !== r.expectedWinnerId,
  );
  const nonKnownGapResults = results.filter((r) => !r.isKnownGap);

  const aggregate: AggregateReport = {
    totalCases: results.length,
    nonLocatedRate: results.length > 0 ? nonLocated.length / results.length : 0,
    falsePositiveRate:
      results.length > 0 ? falsePositives.length / results.length : 0,
    successExcludingKnownGaps:
      nonKnownGapResults.length > 0 &&
      nonKnownGapResults.every((r) => r.passed),
  };

  console.log("### AGGREGATE STATS");
  console.log(`Total cases: ${aggregate.totalCases}`);
  console.log(
    `Non-located rate: ${(aggregate.nonLocatedRate * 100).toFixed(1)}%`,
  );
  console.log(
    `False-positive rate: ${(aggregate.falsePositiveRate * 100).toFixed(1)}%`,
  );
  console.log(
    `Success excluding known-gaps: ${aggregate.successExcludingKnownGaps}`,
  );
  console.log("\n");

  const success = results.every((r) => r.passed);

  const reportDir = path.join(process.cwd(), ".gimbal");
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, "sandbox-report.json"),
    JSON.stringify({ results, success, aggregate }, null, 2),
    "utf-8",
  );

  return {
    results,
    success,
    successExcludingKnownGaps: aggregate.successExcludingKnownGaps,
    aggregate,
  };
}
