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

// Agent-facing MCP control plane, hosted by `gimbal mcp`. Every tool proxies to core over REST,
// no in-process shortcut (invariant #7, LLD-008).
export function buildMcpServer(client: CoreClient): McpServer {
  const server = new McpServer({ name: "gimbal", version: "0.1.0" });

  server.registerTool(
    "getMap",
    {
      description:
        "Look up a route's UI structure before authoring a test against it. Returns the Knowledge " +
        "Dependency Graph (KDG) for one entry URL: parent/child component containment plus every " +
        "conditional render branch (ternary, &&, .map, early-return, switch) resolved to one of three " +
        "states: resolved (raw condition, safe to read), needs_trace (a pointer to the exact file/line " +
        "to check next), or unknown (runtime-only, e.g. a network feature flag). Next.js App Router only " +
        "in v1. Static analysis, no LLM call, cheap to re-run. Use this instead of re-reading the whole " +
        "frontend every time you author or repair a test. It is a hint, not ground truth: grounding " +
        "against the live DOM always wins if they disagree.",
      inputSchema: {
        entryUrl: z
          .string()
          .describe(
            "The route URL whose page.tsx you want the component subgraph for, e.g. '/login'.",
          ),
      },
    },
    async ({ entryUrl }) => toolHandler(() => client.getKdg(entryUrl))(),
  );

  server.registerTool(
    "getDelta",
    {
      description:
        "Check what changed in the KDG since a version you already fetched with getMap, instead of " +
        "re-fetching the whole subgraph. Use after a code change when you want to know if anything " +
        "relevant to your test moved.",
      inputSchema: {
        sinceVersion: z
          .string()
          .describe("A KDG version identifier previously returned by getMap."),
      },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify({ changed: [] }) }],
    }),
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
        const payload = await client.getRepairPayload(testId);
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
    "healing",
    {
      description:
        "Fetch the repair payload for a stale test: the current Spec IR, the last grounded test case, and " +
        "the KDG context for the route. Read-only: it never repairs anything itself, and no LLM call " +
        "happens on Gimbal's side. You are the one who reasons over this payload, re-authors just the " +
        "affected Tier-1 target(s) (stay DOM-blind, don't guess a selector), and submits the fix via " +
        "updateTest. A step usually goes stale because the element was removed, the app reached an " +
        "unreached state, its semantic identity fully changed, or two candidates are ambiguously tied, " +
        "not because of routine attribute/class churn, which the runtime heal already absorbed silently.",
      inputSchema: {
        testId: z
          .string()
          .describe("The ID of the stale test to fetch repair context for."),
      },
    },
    async ({ testId }) => toolHandler(() => client.getRepairPayload(testId))(),
  );

  server.registerTool(
    "updateTest",
    {
      description:
        "Submit your re-authored fix for a stale test. This is the only repair path: there is no core-side " +
        "fallback, so spec is required and must be the full patched Spec IR (not a diff). Pass the stepIds " +
        "you actually changed so the review surface can highlight them. After this call, the affected " +
        "step(s) get re-grounded automatically and the result is a diff for the developer to review, never " +
        "an auto-committed change. Only touch the steps that actually need repair: a layer-targeted fix " +
        "(re-ground a broken selector, or re-author a changed intent) beats regenerating the whole test.",
      inputSchema: {
        testId: z.string().describe("The stale test's ID."),
        stepIds: z
          .array(z.string())
          .describe("IDs of the steps you actually repaired."),
        spec: SpecIR.describe("The full patched Spec IR, not a partial diff."),
      },
    },
    async ({ testId, stepIds, spec }) =>
      toolHandler(() => client.maintain(testId, { stepIds, spec }))(),
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
