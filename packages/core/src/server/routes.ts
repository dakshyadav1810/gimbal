import { randomUUID } from "node:crypto";
import { MaintainRequest, RunRequest } from "@gimbal/shared";
import type { FastifyInstance } from "fastify";
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
    // A re-ground must not be shadowed by a stale runtime-heal cache entry from a prior grounding:
    // the cache key (testId, stepId, domHash) can coincidentally collide across groundings.
    // resolution_cache is keyed by spec.flow.id (the author-chosen flow id), not this route's
    // storage-layer :id (a separately generated UUID) — see locate.ts's testId derivation.
    c.cache.clearSelectorsForTest(spec.flow.id);
    const outcome = await c.grounding.ground(spec, {});
    await c.store.saveCandidates(id, outcome.candidates);
    await c.store.saveGrounded(id, outcome.grounded);
    if (outcome.stoppedAt) reply.code(200); // still 200: partial grounding is a valid, reviewable result
    return outcome;
  });

  app.get("/tests/:id/repair", async (req) => {
    const { id } = req.params as { id: string };
    return c.healing.buildRepairPayload(id);
  });

  app.get("/tests/:id/runs", async (req) => {
    const { id } = req.params as { id: string };
    return c.cache.listRuns(id);
  });

  app.get("/tests/:id/reviews", async (req) => {
    const { id } = req.params as { id: string };
    return c.cache.openReviews(id);
  });

  app.post("/tests/:id/maintain", async (req) => {
    const { id } = req.params as { id: string };
    const { stepIds, spec } = MaintainRequest.parse(req.body);
    const result = await c.healing.maintain(id, stepIds, spec);
    await c.store.saveGrounded(id, result.after);
    return result;
  });

  // --- reviews ---
  app.get("/reviews", async () => c.cache.openReviews());

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

  // --- kdg ---
  app.get("/kdg", async (req) => {
    const { entry } = req.query as { entry?: string };
    return c.kdg.build(entry ?? "");
  });
  app.get("/kdg/delta", async () => ({ changed: [] })); // future — needs KDG versioning (SPEC-005)
}
