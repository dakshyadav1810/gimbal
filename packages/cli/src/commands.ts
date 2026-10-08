import type { Command } from "commander";
import open from "open";
import { CoreClient } from "./client.js";
import { baseUrl, loadConfig } from "./config.js";
import { isCoreAlive, startCore, stopCore } from "./core-process.js";
import { type Check, checkNode, checkUrl, formatReport } from "./doctor.js";
import { MCP_ADD, MCP_JSON, initProject } from "./init.js";
import { startMcp } from "./mcp/server.js";
import { REPORTERS, type TestRun, exitCode, outcomeOf } from "./reporters.js";

export function registerCommands(program: Command) {
  program
    .command("init")
    .option("--agent <name>", "also install the agent skill (claude)")
    .description(
      "set up .gimbal/ and gimbal.config.json here (safe to run again)",
    )
    .action(async (opts) => {
      console.log("Gimbal init");
      for (const line of initProject(process.cwd(), opts)) console.log(line);
      console.log(
        `\nConnect your coding agent:\n  ${MCP_ADD}\nor add this MCP server:\n${MCP_JSON}\n`,
      );
      await runDoctorCommand({});
    });

  program
    .command("doctor")
    .option("--url <url>", "address of the app to test")
    .option("--download", "download the embedding model if it is missing")
    .description("check that this machine is ready to run Gimbal")
    .action(async (opts) => {
      await runDoctorCommand(opts);
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
    .option("--reporter <name>", "list | json | junit", "list")
    .option("--bail", "stop after the first failing test")
    .option("--strict", "treat 'needs review' as a failure")
    .description(
      "run a test or all tests. Exit code: 0 passed, 1 failed, 2 needs review (1 with --strict)",
    )
    .action(async (testId, opts) => {
      const reporter = REPORTERS[opts.reporter as keyof typeof REPORTERS];
      if (!reporter) {
        console.error(
          `unknown reporter ${opts.reporter}; use list, json or junit`,
        );
        process.exitCode = 1;
        return;
      }
      const client = new CoreClient(baseUrl(loadConfig()));
      const tests = await client.listTests();
      const targets = testId ? tests.filter((t) => t.testId === testId) : tests;
      if (testId && targets.length === 0) {
        console.error(
          `no test ${testId}; run \`gimbal repair list\` or list tests first`,
        );
        process.exitCode = 1;
        return;
      }
      const runs: TestRun[] = [];
      for (const t of targets) {
        const started = Date.now();
        const { runId } = await client.runTest({ testId: t.testId });
        const report = await pollReport(client, runId);
        runs.push({
          testId: t.testId,
          name: t.name,
          report,
          seconds: (Date.now() - started) / 1000,
        });
        if (opts.bail && outcomeOf(report) === "failed") break;
      }
      console.log(reporter(runs));
      process.exitCode = exitCode(runs, Boolean(opts.strict));
    });

  const repair = program
    .command("repair")
    .description("review what Gimbal healed or could not heal");
  const client = () => new CoreClient(baseUrl(loadConfig()));

  repair
    .command("list")
    .option("--test <testId>", "only this test")
    .option("--status <status>", "proposed | needed | accepted | rejected")
    .description("list repairs (default: everything still open)")
    .action(async (opts) => {
      const all = await client().listRepairs({
        testId: opts.test,
        status: opts.status,
      });
      const rows = opts.status
        ? all
        : all.filter((r) => r.status === "proposed" || r.status === "needed");
      if (rows.length === 0) console.log("nothing to review");
      for (const r of rows) {
        const to = r.after ? ` -> ${r.after.label ?? r.after.selector}` : "";
        console.log(
          `${r.id.slice(0, 8)}  ${r.status.padEnd(9)} ${r.testId}/${r.stepId}  ${r.before.label ?? r.before.selector}${to}${r.reason ? `  (${r.reason})` : ""}`,
        );
      }
    });

  const findRepair = async (prefix: string) => {
    const matches = (await client().listRepairs()).filter((r) =>
      r.id.startsWith(prefix),
    );
    if (matches.length !== 1)
      throw new Error(
        matches.length === 0
          ? `no repair starts with ${prefix}`
          : `${prefix} matches ${matches.length} repairs; use more characters`,
      );
    return matches[0];
  };

  repair
    .command("show")
    .argument("<repairId>", "repair id (or its first characters)")
    .action(async (id) => {
      console.log(JSON.stringify(await findRepair(id), null, 2));
    });

  repair
    .command("accept")
    .argument("<repairId>")
    .description("fold a heal proposal into the test's grounded.json")
    .action(async (id) => {
      const r = await client().acceptRepair((await findRepair(id)).id);
      console.log(
        `accepted: ${r.testId}/${r.stepId} now uses ${r.after?.selector}. Commit .gimbal/tests/${r.testId}/grounded.json.`,
      );
    });

  repair
    .command("reject")
    .argument("<repairId>")
    .option("--reason <text>")
    .description(
      "reject a proposal; the same selector will not be proposed again",
    )
    .action(async (id, opts) => {
      const r = await client().rejectRepair(
        (await findRepair(id)).id,
        opts.reason,
      );
      console.log(`rejected: ${r.testId}/${r.stepId}`);
    });

  repair
    .command("context")
    .argument("<testId>")
    .description(
      "print the repair context for a test (read-only; hand it to your coding agent)",
    )
    .action(async (testId) => {
      console.log(
        JSON.stringify(await client().getRepairContext(testId), null, 2),
      );
      console.log(
        "\nHand this to your connected agent and have it call `submitRepair`. Gimbal has no model of its own to repair this.",
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

async function runDoctorCommand(opts: { url?: string; download?: boolean }) {
  const config = loadConfig();
  const checks: Check[] = [checkNode()];

  let alive = await isCoreAlive(config);
  if (!alive) {
    try {
      await startCore(config, await resolveCoreEntry());
      alive = true;
    } catch (e) {
      checks.push({
        name: "Gimbal server",
        ok: false,
        detail: String(e).slice(0, 160),
        fix: "run `gimbal start` and read the error it prints",
      });
    }
  }
  const client = new CoreClient(baseUrl(config));
  let startUrl: string | undefined;
  if (alive) {
    checks.push({ name: "Gimbal server", ok: true });
    if (opts.download) {
      console.log("Downloading the embedding model (first time only)...");
      await client.warmModel().catch((e) => console.log(String(e)));
    }
    try {
      const env = await client.doctor();
      checks.push({
        name: "Chromium",
        ok: env.chromium.ok,
        detail: env.chromium.ok ? undefined : env.chromium.detail,
        fix: "npx playwright install chromium",
      });
      checks.push({
        name: `Embedding model (${env.embedding.model}, rev ${env.embedding.revision.slice(0, 8)})`,
        ok: env.embedding.ok,
        detail: env.embedding.ok ? undefined : env.embedding.detail,
        fix: "connect once and run `gimbal doctor --download`, or set HF_HUB_OFFLINE=0",
      });
    } catch (e) {
      checks.push({ name: "Environment", ok: false, detail: String(e) });
    }
    try {
      const first = (await client.listTests())[0];
      if (first) {
        const t = await client.getTest(first.testId);
        startUrl = t.flow.startUrl;
      }
    } catch {
      // no tests yet; fall back to the configured app address
    }
  }
  const target = opts.url ?? config.appUrl ?? startUrl;
  if (target) checks.push(await checkUrl(target));

  console.log(formatReport(checks));
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}
