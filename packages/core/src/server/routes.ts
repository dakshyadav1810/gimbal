import { randomUUID } from "node:crypto";
import { MaintainRequest, RunRequest } from "@gimbal/shared";
import { RepairError, acceptRepair, rejectRepair } from "../repairs/decide.js";
import type { FastifyInstance } from "fastify";
import { exploreUiState } from "../authoring/telemetry.js";
import { summarizeUngrounded } from "../grounding/summarize.js";
import type { Container } from "./container.js";
import type { WsHub } from "./ws-hub.js";

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
      return apiError("validation", String(e));
    }
  });

  app.get("/tests", async () => c.store.list());

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
      return {
        ...outcome,
        ungrounded: summarizeUngrounded(outcome.candidates),
      };
    }
    return outcome;
  });

  app.get("/tests/:id/repair", async (req) => {
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

  app.post("/tests/:id/maintain", async (req) => {
    const { id } = req.params as { id: string };
    const { stepIds, spec } = MaintainRequest.parse(req.body);
    return c.healing.maintain(id, stepIds, spec);
  });

  // --- repairs ---
  app.get("/repairs", async (req) => {
    const { status, testId } = req.query as { status?: string; testId?: string };
    const all = testId ? await c.repairs.list(testId) : await c.repairs.listAll();
    return status ? all.filter((r) => r.status === status) : all;
  });

  const decide =
    (fn: (id: string, body: { reason?: string }) => Promise<unknown>) =>
    async (req: any, reply: any) => {
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

  // Transitional view for the dashboard's old review queue; replaced by the Repairs page (Phase 3).
  app.get("/reviews", async () =>
    (await c.repairs.listAll())
      .filter((r) => r.status === "needed" || r.status === "proposed")
      .map((r) => ({ testId: r.testId, stepId: r.stepId, url: "", candidatesJson: "[]" })),
  );

  // --- runs ---
  app.post("/runs", async (req, reply) => {
    const { testId, vars } = RunRequest.parse(req.body);
    let test: Awaited<ReturnType<typeof c.store.loadGrounded>>;
    try {
      test = await c.store.loadGrounded(testId);
    } catch {
      reply.code(409);
      return apiError("ungrounded", `test ${testId} is not grounded yet`);
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
        action: any;
        target?: any;
        value?: string;
      };
      return await exploreUiState(c.config, c.resolver, body);
    } catch (e) {
      reply.code(400);
      return apiError("explore_failed", String(e));
    }
  });

  // --- kdg ---
  app.get("/kdg", async (req) => {
    const { entry } = req.query as { entry?: string };
    return c.kdg.build(entry ?? "");
  });
  app.get("/kdg/delta", async () => ({ changed: [] })); // future — needs KDG versioning (SPEC-005)
}
