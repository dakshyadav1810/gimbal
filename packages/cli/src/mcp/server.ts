import { RunRequest, SpecIR, Tier1Target } from "@gimbal/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CoreApiError, type CoreClient } from "../client.js";
import { compileDsl } from "../dsl/compiler.js";
import { decompileSpec } from "../dsl/decompiler.js";
import { parseDsl } from "../dsl/parser.js";

// Every tool handler is wrapped with this so a CoreApiError (or any other throw) surfaces as a
// clean, human-readable MCP error instead of an unformatted exception — this is the first thing
// a new user sees on their first three calls (submitSpec/groundTest/runTest), so the message
// needs to be actionable without them reading a raw HTTP+JSON dump.
function toolHandler<T>(fn: () => Promise<T>) {
  return async () => {
    try {
      const res = await fn();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(res) }],
      };
    } catch (err) {
      const message =
        err instanceof CoreApiError
          ? `gimbal core error (${err.apiCode}): ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      return {
        content: [{ type: "text" as const, text: message }],
        isError: true,
      };
    }
  };
}

const INSTRUCTIONS =
  "Gimbal runs browser tests described as JSON/YAML and keeps them working when the UI changes. " +
  "Workflow: getPage (see the real controls) -> author DOM-blind with authorTest or executeDsl -> runTest. " +
  "When the UI changes, Gimbal heals at run time and records a repair; steps it cannot trust are marked " +
  "'needed'. Use listRepairs, then getRepairContext and submitRepair to fix them. Never invent selectors. " +
  "Heal proposals are accepted or rejected by the developer, not by you. Give every click or submit " +
  "an expected outcome or assertion so a wrong heal is caught.";

// Agent-facing MCP control plane, hosted by `gimbal mcp`. Every tool proxies to core over REST,
// no in-process shortcut (invariant #7, LLD-008).
export function buildMcpServer(client: CoreClient): McpServer {
  const server = new McpServer(
    { name: "gimbal", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "getPage",
    {
      description:
        "See what a page looked like the last time Gimbal observed it: element roles, accessible names, " +
        "regions (form/modal/section), test ids and disabled state, plus whether the browser was logged in. " +
        "Use it BEFORE authoring so you describe real controls instead of guessing. It is one observation, " +
        "not the app: states nobody visited (other users, open dialogs, other data) are absent, and the " +
        "response says when it was captured. Never contains typed values or URL query strings. Served from " +
        "memory when available; set refresh=true (or call it for a page never seen) to open the page now. " +
        "It is a hint: grounding against the live page decides.",
      inputSchema: {
        url: z
          .string()
          .describe("Full page URL, e.g. 'http://localhost:3000/login'."),
        refresh: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Open the page now instead of using the remembered snapshot.",
          ),
      },
    },
    async ({ url, refresh }) =>
      toolHandler(() => client.getPage(url, refresh))(),
  );

  server.registerTool(
    "exploreUiState",
    {
      description:
        "Perform exploratory DOM telemetry on a running application. Navigates to the given URL, " +
        "optionally executes an action (e.g. click, type) on a target element, and returns a concise " +
        "DomDiff of added/removed elements (such as newly opened modals, dropdown items, or buttons), " +
        "along with any resulting URL change and screenshot. Use this tool to inspect UI state changes " +
        "interactively without authoring or committing a permanent test spec.",
      inputSchema: {
        url: z.string().describe("The URL of the page to explore."),
        action: z
          .enum([
            "click",
            "type",
            "select",
            "keypress",
            "submit",
            "navigate",
            "wait",
            "file",
          ])
          .default("click")
          .describe("Action to perform on the target element."),
        target: Tier1Target.optional().describe(
          "The Tier-1 target element to act upon.",
        ),
        value: z
          .string()
          .optional()
          .describe("Value to type or select if applicable."),
      },
    },
    async ({ url, action, target, value }) =>
      toolHandler(() =>
        client.explore({
          url,
          action,
          target,
          value,
        }),
      )(),
  );

  server.registerTool(
    "authorTest",
    {
      description:
        "Single-turn test authoring and grounding: validates, submits, and grounds a test against the live " +
        "running app in 1 turn. Accepts either a YAML DSL string (pass via `dsl`), a full SpecIR JSON object, " +
        "or an existing `testId` to re-ground. Author DOM-blind: describe each UI target by role, semantics, " +
        "and intent rather than guessing a selector. Returns the grounded test artifact or structured " +
        "candidate ambiguity details.",
      inputSchema: {
        testId: z
          .string()
          .optional()
          .describe(
            "Optional existing testId to re-ground against the live application.",
          ),
        version: z.literal("1.0").optional(),
        flow: SpecIR.shape.flow.optional(),
        steps: SpecIR.shape.steps.optional(),
        dsl: z
          .string()
          .optional()
          .describe(
            "Optional YAML DSL string. When present, compiled to SpecIR automatically.",
          ),
      },
    },
    async (input) =>
      toolHandler(async () => {
        if (input.testId && !input.dsl && !input.steps) {
          return client.groundTest(input.testId);
        }
        let spec: SpecIR;
        if (input.dsl) {
          const ast = parseDsl(input.dsl);
          spec = compileDsl(ast);
        } else {
          spec = input as SpecIR;
        }
        return client.authorTest(spec);
      })(),
  );

  server.registerTool(
    "compileDsl",
    {
      description:
        "Compile a YAML DSL string into a SpecIR JSON object without submitting it. " +
        "Use this to preview the compiled output before calling authorTest or executeDsl. " +
        'Supports actions (`navigate: /path`, `click: button("Label")`, `type: FieldName = "value"`, ' +
        '`select: Field = "Option"`) and assertions including spatial geometric checks ' +
        '(`assert: urlContains("/path")`, `assert: visible(button("Label"))`, ' +
        "`assert: rightOf(target, refTarget)`, `assert: below(target, refTarget)`, `assert: inside(target, refTarget)`). " +
        "Assertions following a step are automatically attached to it.",
      inputSchema: {
        dsl: z
          .string()
          .describe("YAML DSL string to compile into SpecIR JSON."),
      },
    },
    async ({ dsl }) =>
      toolHandler(() => {
        const ast = parseDsl(dsl);
        const spec = compileDsl(ast);
        return Promise.resolve(spec);
      })(),
  );

  server.registerTool(
    "decompileSpec",
    {
      description:
        "Fetch an existing test spec by ID and return it as a human-readable YAML DSL string. " +
        "Useful for inspecting a test without reading raw JSON, or as a starting point for " +
        "authoring a modified version via authorTest or executeDsl.",
      inputSchema: {
        testId: z
          .string()
          .describe("The test ID whose spec you want to decompile."),
      },
    },
    async ({ testId }) =>
      toolHandler(async () => {
        const payload = await client.getRepairContext(testId);
        const dsl = decompileSpec(payload.specIR);
        return { dsl };
      })(),
  );

  server.registerTool(
    "runTest",
    {
      description:
        "Execute a grounded test. Defaults to synchronous execution (`sync: true`), waiting for " +
        "completion and returning the full RunReport in 1 turn without polling. Set `sync: false` " +
        "only if background asynchronous execution is explicitly required. Pass secret or " +
        "environment-specific values through vars.",
      inputSchema: {
        ...RunRequest.shape,
        sync: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "If true (default), waits for the run to complete and returns the full RunReport in 1 turn.",
          ),
        timeoutMs: z
          .number()
          .optional()
          .default(30000)
          .describe("Timeout in milliseconds when waiting in sync mode."),
      },
    },
    async ({ sync, timeoutMs, ...req }) =>
      toolHandler(async () => {
        if (sync) {
          return client.runTestSync(req, timeoutMs);
        }
        return client.runTest(req);
      })(),
  );

  server.registerTool(
    "executeDsl",
    {
      description:
        "Directly execute a YAML DSL string against a live browser and return the deterministic report in 1 turn. " +
        "Compiles DSL, submits, grounds, and runs synchronously without separate authoring or polling steps.",
      inputSchema: {
        dsl: z.string().describe("The YAML DSL string to execute."),
        vars: z
          .record(z.string())
          .optional()
          .describe("Optional runtime variables for the flow."),
        timeoutMs: z
          .number()
          .optional()
          .default(30000)
          .describe("Timeout in milliseconds for the test execution."),
      },
    },
    async ({ dsl, vars, timeoutMs }) =>
      toolHandler(async () => {
        const ast = parseDsl(dsl);
        const spec = compileDsl(ast);
        const { testId, stoppedAt, ungrounded } = await client.authorTest(spec);
        if (stoppedAt) {
          return {
            status: "ungrounded",
            testId,
            stoppedAt,
            ungrounded,
          };
        }
        return client.runTestSync({ testId, vars }, timeoutMs);
      })(),
  );

  server.registerTool(
    "getReport",
    {
      description:
        "Fetch the full report for a previous run by runId: per-step status (passed/failed/warning/skipped/stale), " +
        "selection source (cached vs. resolver-healed vs. none), confidence band, failure reason/message, " +
        "duration, and screenshots. Note: runTest returns this report directly in 1 turn by default (sync: true).",
      inputSchema: {
        runId: z.string().describe("The run ID returned by runTest."),
      },
    },
    async ({ runId }) => toolHandler(() => client.getReport(runId))(),
  );

  server.registerTool(
    "getRepairContext",
    {
      description:
        "Read-only. Returns what you need to repair a test whose step went stale or whose healing you " +
        "disagree with: the current Spec IR and the last grounded test. Gimbal calls no model here; you " +
        "do the reasoning. Re-author only the affected Tier-1 target(s), staying DOM-blind (describe by " +
        "role, name and intent, never a selector), then send the full patched spec with submitRepair. " +
        "Steps usually go stale because the element was removed, the app is in a state nobody grounded, " +
        "its meaning changed, or two candidates tie. Routine class or attribute churn is already absorbed " +
        "by healing and shows up in listRepairs as a proposal, not here.",
      inputSchema: {
        testId: z
          .string()
          .describe("The test to fetch repair context for (see listRepairs)."),
      },
    },
    async ({ testId }) => toolHandler(() => client.getRepairContext(testId))(),
  );

  server.registerTool(
    "submitRepair",
    {
      description:
        "Send your patched spec for a test. This is the only way an agent changes a test's meaning: " +
        "spec must be the FULL patched Spec IR, not a diff. List the stepIds you changed; only those " +
        "are re-resolved, the rest are replayed from their stored selectors (if replay breaks, Gimbal " +
        "re-grounds everything and says so). The spec and grounding are saved immediately. Nothing is " +
        "committed to git for you. Touch as few steps as you can.",
      inputSchema: {
        testId: z.string().describe("The test being repaired."),
        stepIds: z.array(z.string()).describe("IDs of the steps you changed."),
        spec: SpecIR.describe("The full patched Spec IR."),
      },
    },
    async ({ testId, stepIds, spec }) =>
      toolHandler(() => client.submitRepair(testId, { stepIds, spec }))(),
  );

  server.registerTool(
    "listRepairs",
    {
      description:
        "List repairs Gimbal recorded: heal proposals from runs (a different element was used and " +
        "verified), steps it abstained on (status 'needed': nothing trustworthy was found), and earlier " +
        "decisions. Each has before/after, the evidence behind it and how it was verified. Use status " +
        "'needed' to find what you must fix with getRepairContext + submitRepair. Accepting or rejecting " +
        "a heal proposal is the developer's call in the dashboard or `gimbal repair`; do not assume it.",
      inputSchema: {
        testId: z.string().optional().describe("Only this test."),
        status: z
          .enum(["proposed", "needed", "accepted", "rejected", "superseded"])
          .optional(),
      },
    },
    async ({ testId, status }) =>
      toolHandler(() => client.listRepairs({ testId, status }))(),
  );

  server.registerTool(
    "deleteTest",
    {
      description:
        "Permanently delete a test and its stored history. There is no undo. Confirm with the developer " +
        "before calling this unless they've clearly already decided.",
      inputSchema: {
        testId: z.string().describe("The ID of the test to delete."),
      },
    },
    async ({ testId }) => toolHandler(() => client.deleteTest(testId))(),
  );

  return server;
}

export async function startMcp(client: CoreClient) {
  const server = buildMcpServer(client);
  await server.connect(new StdioServerTransport());
}
