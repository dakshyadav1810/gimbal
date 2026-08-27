import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import fastify from "fastify";
import type { GimbalConfig, GroundedTest } from "@gimbal/shared";
import { buildContainer } from "../../server/container.js";
import { sandboxCases } from "./cases.js";
import { chromium, type Browser, type Page } from "playwright";

export interface EvaluationResult {
  caseId: string;
  name: string;
  selectedWinnerId: string | null;
  expectedWinnerId: string | null;
  band: string;
  expectedBand: string;
  passed: boolean;
  score: number;
}

export async function runEvaluation(): Promise<{
  results: EvaluationResult[];
  success: boolean;
}> {
  const PORT = 31888;
  const server = fastify();
  let currentHtml = "";

  server.get("/case", async (req, reply) => {
    reply.type("text/html").send(currentHtml);
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
    embeddingModel: "Xenova/all-MiniLM-L6-v2",
    bands: { high: 0.7, medium: 0.5 },
    timeouts: { actionMs: 5000, navMs: 10000 },
    db: { readOnly: true },
  };

  const container = buildContainer(config);
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page: Page = await context.newPage();

  const results: EvaluationResult[] = [];

  try {
    for (const c of sandboxCases) {
      currentHtml = c.html;
      await page.goto(`http://127.0.0.1:${PORT}/case`);
      // Wait for any network/DOM rendering
      await page.waitForTimeout(200);

      const mockTest: GroundedTest = {
        version: "1.0",
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
            target: {
              ...c.target,
              resolution: null,
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

      if (c.id === "crm-grid-sibling-shuffle") {
        console.log("CANDIDATES FOR crm-grid-sibling-shuffle:", JSON.stringify(stepResolution.resolution.candidates.map(cand => ({
          id: cand.id,
          selector: cand.selector,
          score: cand.score,
          band: cand.band,
          signals: cand.signals,
          nearbyText: cand.anchors.nearbyText,
        })), null, 2));
      }

      const winner = stepResolution.resolution.candidates.find(
        (cand) => cand.id === stepResolution.resolution.selected,
      );
      const selectedWinnerId = winner?.anchors?.attributes?.id ?? null;

      const isWinnerMatch = selectedWinnerId === c.expectedWinnerId;
      const isBandMatch = stepResolution.band === c.expectedBand;
      const passed = isWinnerMatch && isBandMatch;

      results.push({
        caseId: c.id,
        name: c.name,
        selectedWinnerId,
        expectedWinnerId: c.expectedWinnerId,
        band: stepResolution.band,
        expectedBand: c.expectedBand,
        passed,
        score: winner?.score ?? 0,
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
  console.log(
    "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
  );
  for (const r of results) {
    console.log(
      `| ${r.caseId} | ${r.name} | \`${r.selectedWinnerId ?? "none"}\` | \`${r.expectedWinnerId ?? "none"}\` | \`${r.band}\` | \`${r.expectedBand}\` | ${(r.score * 100).toFixed(0)}% | ${r.passed ? "✅ PASS" : "❌ FAIL"} |`,
    );
  }
  console.log("\n");

  const success = results.every((r) => r.passed);
  return { results, success };
}
