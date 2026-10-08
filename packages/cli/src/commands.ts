import type { Command } from "commander";
import open from "open";
import { CoreClient } from "./client.js";
import { baseUrl, loadConfig } from "./config.js";
import { isCoreAlive, startCore, stopCore } from "./core-process.js";
import { startMcp } from "./mcp/server.js";

export function registerCommands(program: Command) {
  program
    .command("init")
    .description("scaffold .gimbal/ + gimbal.config.json in the project")
    .action(async () => {
      const fs = await import("node:fs");
      fs.mkdirSync(".gimbal/tests", { recursive: true });
      if (!fs.existsSync("gimbal.config.json")) {
        fs.writeFileSync(
          "gimbal.config.json",
          JSON.stringify({ port: 4319 }, null, 2),
        );
      }
      console.log("initialized .gimbal/ and gimbal.config.json");
    });

  program
    .command("start")
    .description(
      "start core in the background (no-op if already running) and open the dashboard",
    )
    .action(async () => {
      const config = loadConfig();
      if (await isCoreAlive(config)) {
        console.log(`core already running on ${baseUrl(config)}`);
      } else {
        const coreEntry = await resolveCoreEntry();
        await startCore(config, coreEntry);
        console.log(`core listening on ${baseUrl(config)}`);
      }
      await open(baseUrl(config));
    });

  program
    .command("mcp")
    .description(
      "start the MCP stdio server for a coding agent; connects to an already-running core " +
        "(spawning one in the background on first use) and never opens the dashboard. This is " +
        "the command to register with `claude mcp add`, since it's meant to be started and stopped " +
        "per agent session without side effects on a shared core.",
    )
    .action(async () => {
      const config = loadConfig();
      if (!(await isCoreAlive(config))) {
        const coreEntry = await resolveCoreEntry();
        await startCore(config, coreEntry);
      }
      const client = new CoreClient(baseUrl(config));
      await startMcp(client); // blocks on stdio
    });

  program
    .command("stop")
    .description("graceful shutdown of core")
    .action(() => {
      console.log(
        stopCore()
          ? "core stopped"
          : "no running core found (.gimbal/gimbal.pid missing)",
      );
    });

  // No `gimbal author` command: Gimbal has no LLM client. A spec can only be created by a connected
  // agent calling `submitSpec` over MCP (SPEC-001 §2).

  program
    .command("ground")
    .argument("<testId>")
    .description("first-run grounding")
    .action(async (testId) => {
      const client = new CoreClient(baseUrl(loadConfig()));
      console.log(JSON.stringify(await client.groundTest(testId), null, 2));
    });

  program
    .command("test")
    .argument("[testId]")
    .description("run test / suite; print report")
    .action(async (testId) => {
      const client = new CoreClient(baseUrl(loadConfig()));
      const ids = testId
        ? [testId]
        : (await client.listTests()).map((t) => t.testId);
      let allPassed = true;
      for (const id of ids) {
        const { runId } = await client.runTest({ testId: id });
        const report = await pollReport(client, runId);
        console.log(
          `${id}: ${report.status}${report.needsReview ? " (needs review)" : ""}`,
        );
        if (report.status !== "passed") allPassed = false;
      }
      process.exitCode = allPassed ? 0 : 1;
    });

  program
    .command("heal")
    .argument("<testId>")
    .description(
      "print the repair payload for a stale test (read-only — no LLM call)",
    )
    .action(async (testId) => {
      const client = new CoreClient(baseUrl(loadConfig()));
      const payload = await client.getRepairPayload(testId);
      console.log(JSON.stringify(payload, null, 2));
      console.log(
        "\nHand this to your connected coding agent, then have it call `updateTest` (or `gimbal heal` " +
          "again after it submits a fix) — Gimbal has no LLM of its own to repair this automatically.",
      );
    });

  program
    .command("report")
    .argument("<runId>")
    .description("print a stored run report")
    .action(async (runId) => {
      const client = new CoreClient(baseUrl(loadConfig()));
      console.log(JSON.stringify(await client.getReport(runId), null, 2));
    });

  program
    .command("export")
    .argument("<testId>", "test ID to export")
    .option("-f, --format <format>", "export format (playwright)", "playwright")
    .description(
      "export a grounded Gimbal test to an executable script (e.g. Playwright)",
    )
    .action(async (testId, opts) => {
      const client = new CoreClient(baseUrl(loadConfig()));
      const test = await client.getTest(testId);
      if (!("groundedAt" in test)) {
        throw new Error(
          `Test ${testId} is not grounded yet; run authorTest first.`,
        );
      }
      if (opts.format === "playwright") {
        const { exportToPlaywright } = await import("./export.js");
        const code = exportToPlaywright(test);
        console.log(code);
      } else {
        throw new Error(`Unsupported export format: ${opts.format}`);
      }
    });
}

async function pollReport(client: CoreClient, runId: string) {
  for (let i = 0; i < 200; i++) {
    try {
      return await client.getReport(runId);
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`run ${runId} did not complete in time`);
}

// Resolves core's file path only, to hand to execa as a child process — never imported/called
// directly (invariant #7). @gimbal/core is a dependency solely so this path resolves once published.
async function resolveCoreEntry(): Promise<string> {
  const { createRequire } = await import("node:module");
  return createRequire(import.meta.url).resolve("@gimbal/core");
}
