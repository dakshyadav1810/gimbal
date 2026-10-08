import { randomUUID } from "node:crypto";
import {
  type GetPageResponse,
  MaintainRequest,
  type PageSnapshot,
  type RunReport,
  RunRequest,
} from "@gimbal/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  type ExploreUiRequest,
  exploreUiState,
} from "../authoring/telemetry.js";
import { summarizeUngrounded } from "../grounding/summarize.js";
import { RepairError, acceptRepair, rejectRepair } from "../repairs/decide.js";
import { refreshSnapshot } from "../snapshots/refresh.js";
import type { Container } from "./container.js";
import { runDoctor } from "./doctor.js";
import type { WsHub } from "./ws-hub.js";

// Lint failures name the problem; say what to change as well.
function describeError(e: unknown): string {
  const msg = String(e).replace(/^Error: /, "");
  if (msg.includes("no assertion or expectedOutcome"))
    return `${msg}. Fix: add an assertion or expectedOutcome to at least one step.`;
  if (msg.includes("requires a target"))
    return `${msg}. Fix: give click/type/select steps a target {label, role, semantics}.`;
  if (msg.includes("unresolved var"))
    return `${msg}. Fix: declare the variable in flow.vars.`;
  return msg;
}

// pass / fail / review: a person should look at "review" but nothing in it failed.
function runOutcome(r: RunReport): "running" | "passed" | "failed" | "review" {
  if (r.status === "running") return "running";
  if (r.steps.some((s) => s.status === "failed")) return "failed";
  return r.status === "failed" || r.needsReview ? "review" : "passed";
}

function apiError(code: string, message: string) {
  return { error: { code, message } };
}

// Every route here is registered under the /api prefix (see app.ts) except /health, which stays
// unprefixed as a bare liveness probe. The prefix exists so the dashboard's own client-side routes
// (/tests, /tests/:id, /reviews, ...) can occupy the same path space without colliding with the
// REST API that serves them (LLD-010 §3.2 vs. this file's existing paths).
export async function registerRoutes(
  app: FastifyInstance,
  c: Container,
  hub: WsHub,
) {
  app.get("/health", async () => ({ ok: true, version: "0.1.0" }));

  await app.register(
    async (api) => {
      registerApiRoutes(api, c, hub);
    },
    { prefix: "/api" },
  );
}

function registerApiRoutes(app: FastifyInstance, c: Container, hub: WsHub) {
  // --- environment checks (gimbal doctor) ---
  app.get("/doctor", async () => runDoctor(c.config));
  // Downloads the pinned embedding model now (first use otherwise pays for it mid-grounding).
  app.post("/doctor/warm-model", async (_req, reply) => {
    try {
      await c.embedder.embed("warm up");
      return runDoctor(c.config);
    } catch (e) {
      reply.code(502);
      return apiError(
        "internal",
        `could not load ${c.config.embeddingModel}: ${String(e).slice(0, 200)}. Offline? Connect once to download it.`,
      );
    }
  });

  // --- tests ---
  // The only way a spec is created: the connected agent has already authored it and submits the
  // finished SpecIR here. Core validates + stores; it never generates one itself.
  app.post("/tests", async (req, reply) => {
    try {
      const spec = await c.authoring.submit(req.body);
      const testId = await c.store.saveSpec(spec);
      return { testId, spec };
    } catch (e) {
      reply.code(400);
      return apiError("validation", `${describeError(e)}`);
    }
  });

  // Each entry carries what the list view needs to show trust at a glance: how the last run went and
  // how many repairs are waiting for a person.
  app.get("/tests", async () =>
    Promise.all(
      (await c.store.list()).map(async (t) => {
        const lastSummary = c.cache.listRuns(t.testId)[0];
        const last = lastSummary && c.cache.getRun(lastSummary.runId);
        const open = (await c.repairs.list(t.testId)).filter(
          (r) => r.status === "proposed" || r.status === "needed",
        ).length;
        return {
          ...t,
          lastRun: last
            ? {
                runId: last.runId,
                outcome: runOutcome(last),
                finishedAt: last.finishedAt,
              }
            : null,
          openRepairs: open,
        };
      }),
    ),
  );

  // Hand-edit path for the dashboard's spec editor (PLAN-002 Phase A) — same validation as initial
  // authoring. Only rewrites spec.json; a previously-grounded test keeps its (now possibly stale)
  // grounded.json/candidates until re-grounded, same as any other spec edit.
  app.patch("/tests/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const spec = await c.authoring.submit(req.body);
      await c.store.saveSpec(spec, id);
      return { testId: id, spec };
    } catch (e) {
      reply.code(400);
      return apiError("validation", String(e));
    }
  });

  app.get("/tests/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return await c.store.loadGrounded(id);
    } catch {
      try {
        return await c.store.loadSpec(id);
      } catch {
        reply.code(404);
        return apiError("not_found", `test ${id} not found`);
      }
    }
  });

  app.delete("/tests/:id", async (req) => {
    const { id } = req.params as { id: string };
    await c.store.delete(id);
    return { ok: true };
  });

  app.post("/tests/:id/ground", async (req, reply) => {
    const { id } = req.params as { id: string };
    const spec = await c.store.loadSpec(id);
    const outcome = await c.grounding.ground(spec, {});
    // Only clear the shared selector cache once grounding actually produced a new result —
    // clearing it up front meant a mid-loop throw left the user with neither the old cache nor
    // a new one. resolution_cache is keyed by spec.flow.id (the author-chosen flow id), not this
    // route's storage-layer :id (a separately generated UUID) — see locate.ts's testId derivation.
    c.cache.clearSelectorsForTest(spec.flow.id);
    await c.store.saveCandidates(id, outcome.candidates);
    await c.store.saveGrounded(id, outcome.grounded);
    await c.store.saveAriaSnapshot(id, outcome.ariaSnapshot);
    if (outcome.stoppedAt) {
      reply.code(200); // still 200: partial grounding is a valid, reviewable result
      const ungrounded = summarizeUngrounded(outcome.candidates);
      return {
        ...outcome,
        ungrounded,
        fix: `Step ${outcome.stoppedAt} was not grounded: ${ungrounded[0]?.reason ?? "no match"}. Fix: change that step's target (role, label, semantics) or add a precondition, then call authorTest again.`,
      };
    }
    return outcome;
  });

  app.get("/tests/:id/repair-context", async (req) => {
    const { id } = req.params as { id: string };
    const payload = await c.healing.buildRepairPayload(id);
    const candidates = await c.store.loadCandidates(id);
    return {
      ...payload,
      ungrounded: candidates ? summarizeUngrounded(candidates) : [],
    };
  });

  app.get("/tests/:id/runs", async (req) => {
    const { id } = req.params as { id: string };
    return c.cache.listRuns(id);
  });

  app.get("/tests/:id/repairs", async (req) => {
    const { id } = req.params as { id: string };
    return c.repairs.list(id);
  });

  app.get("/tests/:id/candidates", async (req) => {
    const { id } = req.params as { id: string };
    return c.store.loadCandidates(id);
  });

  app.get("/tests/:id/aria-snapshot", async (req) => {
    const { id } = req.params as { id: string };
    const snapshot = await c.store.loadAriaSnapshot(id);
    return { snapshot };
  });

  app.post("/tests/:id/repair", async (req) => {
    const { id } = req.params as { id: string };
    const { stepIds, spec } = MaintainRequest.parse(req.body);
    return c.healing.maintain(id, stepIds, spec);
  });

  // --- repairs ---
  app.get("/repairs", async (req) => {
    const { status, testId } = req.query as {
      status?: string;
      testId?: string;
    };
    const all = testId
      ? await c.repairs.list(testId)
      : await c.repairs.listAll();
    return status ? all.filter((r) => r.status === status) : all;
  });

  const decide =
    (fn: (id: string, body: { reason?: string }) => Promise<unknown>) =>
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string } | null;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        return await fn(req.params.id, req.body ?? {});
      } catch (e) {
        if (!(e instanceof RepairError)) throw e;
        reply.code(e.code === "not_found" ? 404 : 409);
        return apiError(e.code, e.message);
      }
    };
  app.post(
    "/repairs/:id/accept",
    decide((id) => acceptRepair(c.repairs, c.store, c.cache, id)),
  );
  app.post(
    "/repairs/:id/reject",
    decide((id, body) => rejectRepair(c.repairs, id, body.reason)),
  );

  // --- runs ---
  app.post("/runs", async (req, reply) => {
    const { testId, vars } = RunRequest.parse(req.body);
    let test: Awaited<ReturnType<typeof c.store.loadGrounded>>;
    try {
      test = await c.store.loadGrounded(testId);
    } catch {
      reply.code(409);
      return apiError(
        "ungrounded",
        `test ${testId} is not grounded yet. Fix: call authorTest with testId ${testId}, or run \`gimbal ground ${testId}\`.`,
      );
    }
    const r = test.resolver;
    if (
      r &&
      (r.model !== c.config.embeddingModel ||
        r.revision !== c.config.embeddingRevision)
    ) {
      reply.code(409);
      return apiError(
        "model_mismatch",
        `test ${testId} was grounded with ${r.model}@${r.revision.slice(0, 8)} but the configured model is ${c.config.embeddingModel}@${c.config.embeddingRevision.slice(0, 8)}; re-ground the test`,
      );
    }
    const runId = randomUUID();
    // fire-and-forget: client polls GET /runs/:id or streams GET /ws/runs/:id (LLD-008 §3-4)
    c.runner
      .run(test, {
        testId,
        vars,
        runId,
        emit: (m) => hub.emit(`run:${runId}`, m),
      })
      .catch((e) => req.log.error(e));
    return { runId };
  });

  app.get("/runs/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const report = c.cache.getRun(id);
    if (!report) {
      reply.code(404);
      return apiError("not_found", `run ${id} not found`);
    }
    return report;
  });

  // --- authoring telemetry ---
  app.post("/author/explore", async (req, reply) => {
    try {
      const body = req.body as {
        url: string;
        action: ExploreUiRequest["action"];
        target?: ExploreUiRequest["target"];
        value?: string;
      };
      return await exploreUiState(c.config, c.resolver, body);
    } catch (e) {
      reply.code(400);
      return apiError("explore_failed", String(e));
    }
  });

  // --- page snapshots (what getPage serves) ---
  app.get("/snapshots", async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) {
      reply.code(400);
      return apiError("validation", "url is required");
    }
    const snapshot = await c.snapshots.latest(url);
    if (!snapshot) {
      reply.code(404);
      return apiError(
        "not_found",
        `no snapshot of ${url} yet; call again with refresh to observe it now`,
      );
    }
    return withAge(snapshot);
  });

  // Opens the page in a fresh browser and stores what is there now.
  app.post("/snapshots/refresh", async (req, reply) => {
    const { url } = (req.body ?? {}) as { url?: string };
    if (!url) {
      reply.code(400);
      return apiError("validation", "url is required");
    }
    try {
      const snapshot = await refreshSnapshot(c.config, url);
      await c.snapshots.save(snapshot);
      return withAge(snapshot);
    } catch (e) {
      reply.code(502);
      return apiError(
        "browser_error",
        `could not open ${url}: ${String(e).slice(0, 200)}. Is the app running?`,
      );
    }
  });
}

function withAge(snapshot: PageSnapshot): GetPageResponse {
  return {
    snapshot,
    ageSeconds: Math.max(
      0,
      Math.round((Date.now() - Date.parse(snapshot.capturedAt)) / 1000),
    ),
    note: `Observed at ${snapshot.capturedAt}. States that were not visited (logged-out vs logged-in views, open dialogs, other data) are absent. Treat this as a hint; grounding against the live page decides.`,
  };
}
