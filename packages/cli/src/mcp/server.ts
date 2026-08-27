import { RunRequest, SpecIR } from "@gimbal/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CoreApiError, type CoreClient } from "../client.js";

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
    "submitSpec",
    {
      description:
        "Create a new test. This is the only way a spec is created: Gimbal has no LLM of its own, so " +
        "you author the full Spec IR yourself and submit it here. Author DOM-blind: describe each UI " +
        "target by role, semantics, and intent (label, role, semantics[], actions[], intent) rather than " +
        "guessing a CSS selector or XPath. Grounding attaches the real DOM anchors afterward, and a " +
        "selector you invented would just be discarded. Every actuating step (click, type, select, " +
        "keypress, submit) needs a target; wait/navigate steps must not have one. The spec needs at least " +
        "one assertion or expectedOutcome somewhere, or it will fail lint. Reference vars as ${name} and " +
        "declare each one in flow.vars. Never inline a secret value; pass it at run time via runTest's " +
        "vars instead. After this call, run groundTest before runTest; a fresh spec is not runnable yet.",
      inputSchema: SpecIR.shape,
    },
    async (spec) => toolHandler(() => client.submitSpec(spec as SpecIR))(),
  );

  server.registerTool(
    "groundTest",
    {
      description:
        "Resolve a DOM-blind spec against the live app so it becomes runnable. Launches a real browser, " +
        "walks the steps in order, and for each UI target extracts live candidates and scores them with " +
        "the deterministic multi-signal resolver (semantics, affordance, context, structure, index; no " +
        "LLM). A step grounds when its winning candidate clears the medium-confidence band; the durable " +
        "selector (data-testid > stable id > unique CSS > role+name) gets cached for fast re-runs. If a " +
        "step can't be confidently resolved it comes back ungrounded and grounding stops advancing past " +
        "it, since later steps depend on page state that step would have produced. The target app must " +
        "already be running locally: Gimbal drives it, it doesn't start it. Required before the first " +
        "runTest, and again any time the spec changes or a step goes stale. Check the response for " +
        "ungrounded steps before assuming the test is ready to run: an ambiguous target usually means add " +
        "a disambiguator (index, nearby text) or richer semantics, not retry the same spec unchanged.",
      inputSchema: {
        testId: z.string().describe("The spec/test ID returned by submitSpec."),
      },
    },
    async ({ testId }) => toolHandler(() => client.groundTest(testId))(),
  );

  server.registerTool(
    "runTest",
    {
      description:
        "Execute a grounded test and get back a run ID. Steps run in order; each uses its cached selector " +
        "first, falls back to a deterministic re-ground (a silent, logged heal) if the cached selector no " +
        "longer uniquely resolves, and only fails as stale if even that can't find a confident match. An " +
        "assertion failure (element found, app behaved wrong) is never treated as a heal opportunity: " +
        "that is a real bug and gets reported as a failure, full stop. Pass secret or environment-specific " +
        "values through vars here rather than baking them into the spec. Poll getReport (or pollRun) with " +
        "the returned runId to see results; this call does not block until the run finishes.",
      inputSchema: RunRequest.shape,
    },
    async (req) => toolHandler(() => client.runTest(req))(),
  );

  server.registerTool(
    "getReport",
    {
      description:
        "Fetch the full report for a run: per-step status (passed/failed/warning/skipped/stale), which " +
        "selection source resolved each step (cached vs. resolver-healed vs. none), confidence band, " +
        "failure reason/message, duration, and a screenshot where captured. needsReview on the report " +
        "means at least one step needs author attention. Use this to decide next action: a stale step " +
        "means call healing next, not retry the run as-is.",
      inputSchema: {
        runId: z.string().describe("The run ID returned by runTest."),
      },
    },
    async ({ runId }) => toolHandler(() => client.getReport(runId))(),
  );
  server.registerTool(
    "pollRun",
    {
      description:
        "Alias for getReport. Poll a run's status/report by runId while it's still in progress or to " +
        "fetch its final result. Prefer calling this in a loop right after runTest instead of assuming the " +
        "run is done immediately.",
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
