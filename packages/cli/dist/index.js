#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";

// src/commands.ts
import open from "open";

// src/client.ts
var CoreClient = class {
  constructor(base) {
    this.base = base;
  }
  base;
  async req(method, path2, body) {
    const res = await fetch(`${this.base}${path2}`, {
      method,
      headers: body ? { "content-type": "application/json" } : void 0,
      body: body ? JSON.stringify(body) : void 0
    });
    if (!res.ok)
      throw new Error(
        `${method} ${path2} -> ${res.status}: ${await res.text()}`
      );
    return res.json();
  }
  health() {
    return this.req("GET", "/health");
  }
  getKdg(entryUrl) {
    return this.req(
      "GET",
      `/api/kdg?entry=${encodeURIComponent(entryUrl)}`
    );
  }
  submitSpec(spec) {
    return this.req(
      "POST",
      "/api/tests",
      spec
    );
  }
  groundTest(testId) {
    return this.req(
      "POST",
      `/api/tests/${testId}/ground`
    );
  }
  listTests() {
    return this.req("GET", "/api/tests");
  }
  getTest(testId) {
    return this.req("GET", `/api/tests/${testId}`);
  }
  deleteTest(testId) {
    return this.req("DELETE", `/api/tests/${testId}`);
  }
  runTest(req) {
    return this.req("POST", "/api/runs", req);
  }
  getReport(runId) {
    return this.req("GET", `/api/runs/${runId}`);
  }
  getRepairPayload(testId) {
    return this.req("GET", `/api/tests/${testId}/repair`);
  }
  maintain(testId, req) {
    return this.req(
      "POST",
      `/api/tests/${testId}/maintain`,
      req
    );
  }
};

// src/config.ts
import fs from "fs";
import { GimbalConfig } from "@gimbal/shared";
function loadConfig(flags = {}) {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync("gimbal.config.json", "utf-8"));
  } catch {
  }
  const envConfig = process.env.GIMBAL_PORT ? { port: Number(process.env.GIMBAL_PORT) } : {};
  return GimbalConfig.parse({ ...fileConfig, ...envConfig, ...flags });
}
function baseUrl(config) {
  return `http://127.0.0.1:${config.port}`;
}

// src/core-process.ts
import fs2 from "fs";
import path from "path";
import { execa } from "execa";
var PID_FILE = path.join(".gimbal", "gimbal.pid");
async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`core did not become healthy within ${timeoutMs}ms`);
}
async function isCoreAlive(config) {
  try {
    const res = await fetch(`${baseUrl(config)}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
async function startCore(config, coreEntry) {
  const child = execa("node", [coreEntry], {
    env: { ...process.env, GIMBAL_PORT: String(config.port) },
    detached: true,
    stdio: "ignore"
  });
  fs2.mkdirSync(".gimbal", { recursive: true });
  fs2.writeFileSync(PID_FILE, String(child.pid));
  child.unref();
  await waitForHealth(baseUrl(config), 15e3);
  return child.pid;
}
function stopCore() {
  if (!fs2.existsSync(PID_FILE)) return false;
  const pid = Number(fs2.readFileSync(PID_FILE, "utf-8"));
  try {
    process.kill(pid, "SIGTERM");
  } catch {
  }
  fs2.rmSync(PID_FILE, { force: true });
  return true;
}

// src/mcp/server.ts
import { RunRequest, SpecIR } from "@gimbal/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
function buildMcpServer(client) {
  const server = new McpServer({ name: "gimbal", version: "0.1.0" });
  server.registerTool(
    "getMap",
    {
      description: "Look up a route's UI structure before authoring a test against it. Returns the Knowledge Dependency Graph (KDG) for one entry URL: parent/child component containment plus every conditional render branch (ternary, &&, .map, early-return, switch) resolved to one of three states: resolved (raw condition, safe to read), needs_trace (a pointer to the exact file/line to check next), or unknown (runtime-only, e.g. a network feature flag). Next.js App Router only in v1. Static analysis, no LLM call, cheap to re-run. Use this instead of re-reading the whole frontend every time you author or repair a test. It is a hint, not ground truth: grounding against the live DOM always wins if they disagree.",
      inputSchema: {
        entryUrl: z.string().describe("The route URL whose page.tsx you want the component subgraph for, e.g. '/login'.")
      }
    },
    async ({ entryUrl }) => {
      const kdg = await client.getKdg(entryUrl);
      return { content: [{ type: "text", text: JSON.stringify(kdg) }] };
    }
  );
  server.registerTool(
    "getDelta",
    {
      description: "Check what changed in the KDG since a version you already fetched with getMap, instead of re-fetching the whole subgraph. Use after a code change when you want to know if anything relevant to your test moved.",
      inputSchema: {
        sinceVersion: z.string().describe("A KDG version identifier previously returned by getMap.")
      }
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify({ changed: [] }) }]
    })
  );
  server.registerTool(
    "submitSpec",
    {
      description: "Create a new test. This is the only way a spec is created: Gimbal has no LLM of its own, so you author the full Spec IR yourself and submit it here. Author DOM-blind: describe each UI target by role, semantics, and intent (label, role, semantics[], actions[], intent) rather than guessing a CSS selector or XPath. Grounding attaches the real DOM anchors afterward, and a selector you invented would just be discarded. Every actuating step (click, type, select, keypress, submit) needs a target; wait/navigate steps must not have one. The spec needs at least one assertion or expectedOutcome somewhere, or it will fail lint. Reference vars as ${name} and declare each one in flow.vars. Never inline a secret value; pass it at run time via runTest's vars instead. After this call, run groundTest before runTest; a fresh spec is not runnable yet.",
      inputSchema: SpecIR.shape
    },
    async (spec) => {
      const res = await client.submitSpec(spec);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );
  server.registerTool(
    "groundTest",
    {
      description: "Resolve a DOM-blind spec against the live app so it becomes runnable. Launches a real browser, walks the steps in order, and for each UI target extracts live candidates and scores them with the deterministic multi-signal resolver (semantics, affordance, context, structure, index; no LLM). A step grounds when its winning candidate clears the medium-confidence band; the durable selector (data-testid > stable id > unique CSS > role+name) gets cached for fast re-runs. If a step can't be confidently resolved it comes back ungrounded and grounding stops advancing past it, since later steps depend on page state that step would have produced. The target app must already be running locally: Gimbal drives it, it doesn't start it. Required before the first runTest, and again any time the spec changes or a step goes stale. Check the response for ungrounded steps before assuming the test is ready to run: an ambiguous target usually means add a disambiguator (index, nearby text) or richer semantics, not retry the same spec unchanged.",
      inputSchema: { testId: z.string().describe("The spec/test ID returned by submitSpec.") }
    },
    async ({ testId }) => {
      const res = await client.groundTest(testId);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );
  server.registerTool(
    "runTest",
    {
      description: "Execute a grounded test and get back a run ID. Steps run in order; each uses its cached selector first, falls back to a deterministic re-ground (a silent, logged heal) if the cached selector no longer uniquely resolves, and only fails as stale if even that can't find a confident match. An assertion failure (element found, app behaved wrong) is never treated as a heal opportunity: that is a real bug and gets reported as a failure, full stop. Pass secret or environment-specific values through vars here rather than baking them into the spec. Poll getReport (or pollRun) with the returned runId to see results; this call does not block until the run finishes.",
      inputSchema: RunRequest.shape
    },
    async (req) => {
      const res = await client.runTest(req);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );
  server.registerTool(
    "getReport",
    {
      description: "Fetch the full report for a run: per-step status (passed/failed/warning/skipped/stale), which selection source resolved each step (cached vs. resolver-healed vs. none), confidence band, failure reason/message, duration, and a screenshot where captured. needsReview on the report means at least one step needs author attention. Use this to decide next action: a stale step means call healing next, not retry the run as-is.",
      inputSchema: { runId: z.string().describe("The run ID returned by runTest.") }
    },
    async ({ runId }) => {
      const res = await client.getReport(runId);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );
  server.registerTool(
    "pollRun",
    {
      description: "Alias for getReport. Poll a run's status/report by runId while it's still in progress or to fetch its final result. Prefer calling this in a loop right after runTest instead of assuming the run is done immediately.",
      inputSchema: { runId: z.string().describe("The run ID returned by runTest.") }
    },
    async ({ runId }) => {
      const res = await client.getReport(runId);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );
  server.registerTool(
    "healing",
    {
      description: "Fetch the repair payload for a stale test: the current Spec IR, the last grounded test case, and the KDG context for the route. Read-only: it never repairs anything itself, and no LLM call happens on Gimbal's side. You are the one who reasons over this payload, re-authors just the affected Tier-1 target(s) (stay DOM-blind, don't guess a selector), and submits the fix via updateTest. A step usually goes stale because the element was removed, the app reached an unreached state, its semantic identity fully changed, or two candidates are ambiguously tied, not because of routine attribute/class churn, which the runtime heal already absorbed silently.",
      inputSchema: { testId: z.string().describe("The ID of the stale test to fetch repair context for.") }
    },
    async ({ testId }) => {
      const res = await client.getRepairPayload(testId);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );
  server.registerTool(
    "updateTest",
    {
      description: "Submit your re-authored fix for a stale test. This is the only repair path: there is no core-side fallback, so spec is required and must be the full patched Spec IR (not a diff). Pass the stepIds you actually changed so the review surface can highlight them. After this call, the affected step(s) get re-grounded automatically and the result is a diff for the developer to review, never an auto-committed change. Only touch the steps that actually need repair: a layer-targeted fix (re-ground a broken selector, or re-author a changed intent) beats regenerating the whole test.",
      inputSchema: {
        testId: z.string().describe("The stale test's ID."),
        stepIds: z.array(z.string()).describe("IDs of the steps you actually repaired."),
        spec: SpecIR.describe("The full patched Spec IR, not a partial diff.")
      }
    },
    async ({ testId, stepIds, spec }) => {
      const res = await client.maintain(testId, { stepIds, spec });
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );
  server.registerTool(
    "deleteTest",
    {
      description: "Permanently delete a test and its stored history. There is no undo. Confirm with the developer before calling this unless they've clearly already decided.",
      inputSchema: { testId: z.string().describe("The ID of the test to delete.") }
    },
    async ({ testId }) => {
      const res = await client.deleteTest(testId);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );
  return server;
}
async function startMcp(client) {
  const server = buildMcpServer(client);
  await server.connect(new StdioServerTransport());
}

// src/commands.ts
function registerCommands(program2) {
  program2.command("init").description("scaffold .gimbal/ + gimbal.config.json in the project").action(async () => {
    const fs3 = await import("fs");
    fs3.mkdirSync(".gimbal/tests", { recursive: true });
    if (!fs3.existsSync("gimbal.config.json")) {
      fs3.writeFileSync(
        "gimbal.config.json",
        JSON.stringify({ port: 4319 }, null, 2)
      );
    }
    console.log("initialized .gimbal/ and gimbal.config.json");
  });
  program2.command("start").description(
    "start core in the background (no-op if already running) and open the dashboard"
  ).action(async () => {
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
  program2.command("mcp").description(
    "start the MCP stdio server for a coding agent; connects to an already-running core (spawning one in the background on first use) and never opens the dashboard. This is the command to register with `claude mcp add`, since it's meant to be started and stopped per agent session without side effects on a shared core."
  ).action(async () => {
    const config = loadConfig();
    if (!await isCoreAlive(config)) {
      const coreEntry = await resolveCoreEntry();
      await startCore(config, coreEntry);
    }
    const client = new CoreClient(baseUrl(config));
    await startMcp(client);
  });
  program2.command("stop").description("graceful shutdown of core").action(() => {
    console.log(
      stopCore() ? "core stopped" : "no running core found (.gimbal/gimbal.pid missing)"
    );
  });
  program2.command("ground").argument("<testId>").description("first-run grounding").action(async (testId) => {
    const client = new CoreClient(baseUrl(loadConfig()));
    console.log(JSON.stringify(await client.groundTest(testId), null, 2));
  });
  program2.command("test").argument("[testId]").description("run test / suite; print report").action(async (testId) => {
    const client = new CoreClient(baseUrl(loadConfig()));
    const ids = testId ? [testId] : (await client.listTests()).map((t) => t.testId);
    let allPassed = true;
    for (const id of ids) {
      const { runId } = await client.runTest({ testId: id });
      const report = await pollReport(client, runId);
      console.log(
        `${id}: ${report.status}${report.needsReview ? " (needs review)" : ""}`
      );
      if (report.status !== "passed") allPassed = false;
    }
    process.exitCode = allPassed ? 0 : 1;
  });
  program2.command("heal").argument("<testId>").description("print the repair payload for a stale test (read-only \u2014 no LLM call)").action(async (testId) => {
    const client = new CoreClient(baseUrl(loadConfig()));
    const payload = await client.getRepairPayload(testId);
    console.log(JSON.stringify(payload, null, 2));
    console.log(
      "\nHand this to your connected coding agent, then have it call `updateTest` (or `gimbal heal` again after it submits a fix) \u2014 Gimbal has no LLM of its own to repair this automatically."
    );
  });
  program2.command("report").argument("<runId>").description("print a stored run report").action(async (runId) => {
    const client = new CoreClient(baseUrl(loadConfig()));
    console.log(JSON.stringify(await client.getReport(runId), null, 2));
  });
}
async function pollReport(client, runId) {
  for (let i = 0; i < 200; i++) {
    try {
      return await client.getReport(runId);
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`run ${runId} did not complete in time`);
}
async function resolveCoreEntry() {
  const { createRequire } = await import("module");
  return createRequire(import.meta.url).resolve("@gimbal/core");
}

// src/index.ts
var program = new Command("gimbal").description(
  "Gimbal \u2014 deterministic-first AI-native testing platform"
);
registerCommands(program);
program.parseAsync(process.argv);
//# sourceMappingURL=index.js.map