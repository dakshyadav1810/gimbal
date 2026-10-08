import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GimbalConfig } from "@gimbal/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { buildContainer } from "./container.js";

// Building the container is cheap even though it wires the real resolver/embedder: the
// transformer model is lazy-loaded on first .embed() call (embeddings.ts), and none of the
// error-handler cases below reach the resolver — they throw before it's ever touched.
async function makeApp(): Promise<{ app: FastifyInstance; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gimbal-app-test-"));
  const config: GimbalConfig = {
    port: 0,
    browser: "chromium",
    headless: true,
    dbPath: path.join(dir, "cache.db"),
    artifactsDir: path.join(dir, "tests"),
    screenshotsDir: path.join(dir, "screenshots"),
    fixturesDir: path.join(dir, "fixtures"),
    maxScrollPasses: 3,
    determinism: {},
    embeddingModel: "Xenova/all-MiniLM-L6-v2",
    embeddingRevision: "751bff37182d3f1213fa05d7196b954e230abad9",
    healing: { mode: "propose" },
    snapshotsDir: "snapshots",
    snapshots: "ground",
    bands: { high: 0.7, medium: 0.5 },
    timeouts: {
      actionMs: 15000,
      navMs: 30000,
      hydrationNetworkIdleMs: 2000,
      hydrationQuietWindowMs: 150,
    },
    db: { readOnly: true },
  };
  const container = buildContainer(config);
  const app = await buildApp(config, container);
  return { app, dir };
}

describe("local-server hardening", () => {
  it("rejects an unknown Host and a foreign Origin on writes", async () => {
    const { app } = await makeApp();
    const bad = await app.inject({
      method: "GET",
      url: "/api/tests",
      headers: { host: "evil.test" },
    });
    expect(bad.statusCode).toBe(403);
    const cross = await app.inject({
      method: "POST",
      url: "/api/tests",
      headers: { host: "localhost:7777", origin: "https://evil.test" },
      payload: {},
    });
    expect(cross.statusCode).toBe(403);
    await app.close();
  });
});

describe("global error handler", () => {
  let app: FastifyInstance;
  let dir: string;

  beforeEach(async () => {
    ({ app, dir } = await makeApp());
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reports a real ZodError (thrown uncaught from MaintainRequest.parse) as validation/400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tests/some-id/repair",
      payload: { stepIds: "not-an-array", spec: {} }, // fails MaintainRequest schema
    });
    const body = res.json();
    expect(body.error.code).toBe("validation");
    expect(res.statusCode).toBe(400);
  });

  it("does NOT report a non-validation failure (missing spec file) as validation", async () => {
    // /tests/:id/ground has no try/catch — loadSpec() throws a plain fs/parse error uncaught for a
    // test id that was never submitted, which is the exact case that used to be mislabeled "validation".
    const res = await app.inject({
      method: "POST",
      url: "/api/tests/does-not-exist/ground",
    });
    const body = res.json();
    expect(body.error.code).not.toBe("validation");
    expect(body.error.code).toBe("internal");
    expect(res.statusCode).toBe(500);
  });

  it("does not misreport a missing grounded test on GET /tests/:id/repair either", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tests/does-not-exist/repair",
    });
    const body = res.json();
    expect(body.error.code).not.toBe("validation");
  });

  it("still returns the route's own explicit 400/validation for a bad POST /tests body (caught locally)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tests",
      payload: { garbage: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation");
  });

  it("applies the custom error shape to /api routes, not Fastify's default {statusCode,error,message}", async () => {
    // Regression guard: setErrorHandler must be registered before registerRoutes(), since /api
    // routes live inside their own encapsulated child plugin context (routes.ts) — set after,
    // it silently never applies to anything under /api and every route falls back to Fastify's
    // own default error shape instead of the ApiError one the rest of the app expects.
    const res = await app.inject({
      method: "POST",
      url: "/api/tests/some-id/repair",
      payload: { stepIds: "not-an-array", spec: {} },
    });
    const body = res.json();
    expect(body).toHaveProperty("error");
    expect(body).not.toHaveProperty("statusCode");
    expect(body.error).toHaveProperty("code");
  });

  it("preserves an explicit statusCode set on the thrown error, regardless of classification", async () => {
    app.get("/api/__test-explicit-status", () => {
      const err = Object.assign(new Error("nope"), { statusCode: 418 });
      throw err;
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/__test-explicit-status",
    });
    expect(res.statusCode).toBe(418);
    expect(res.json().error.code).toBe("internal");
  });

  it("returns a clean 409 (not a raw 500) when POST /runs targets a test that hasn't been grounded", async () => {
    // loadGrounded() throws a plain fs error for a test that only has a submitted spec, same as
    // GET /tests/:id's ungrounded-fallback case — POST /runs must catch it explicitly instead of
    // letting the global handler classify it as an opaque "internal" 500.
    const res = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { testId: "does-not-exist" },
    });
    const body = res.json();
    expect(res.statusCode).toBe(409);
    expect(body.error.code).toBe("ungrounded");
  });
});

describe("actionable errors", () => {
  it("tells the caller how to fix a validation failure", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/tests",
      payload: { version: "1.0" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/Fix:|flow|steps/);
  });

  it("explains how to ground an ungrounded test", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { testId: "nope" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toContain("Fix: call authorTest");
  });
});
