import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type GimbalConfig, SpecIR } from "@gimbal/shared";
import fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildContainer } from "../server/container.js";

const PORT = 30999;
const server = fastify();

// Simple mock app to test grounding and execution
let pageHtml = `
  <html>
    <body>
      <div id="login-form">
        <label for="email-input">Email Address</label>
        <input type="text" id="email-input" value="">
        <button id="login-button" onclick="window.location.href='/dashboard'">Log In</button>
      </div>
    </body>
  </html>
`;

server.get("/", async (req, reply) => {
  reply.type("text/html").send(pageHtml);
});

server.get("/dashboard", async (req, reply) => {
  reply.type("text/html").send(`
    <html>
      <body>
        <h1 id="welcome">Welcome to Dashboard</h1>
      </body>
    </html>
  `);
});

describe("Gimbal Full E2E Pipeline", () => {
  let container: ReturnType<typeof buildContainer>;
  let tempDir: string;

  beforeAll(async () => {
    await server.listen({ port: PORT, host: "127.0.0.1" });
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gimbal-e2e-"));
    const config: GimbalConfig = {
      port: PORT,
      browser: "chromium",
      headless: true,
      dbPath: path.join(tempDir, "cache.db"),
      artifactsDir: path.join(tempDir, "tests"),
      screenshotsDir: path.join(tempDir, "screenshots"),
      fixturesDir: path.join(tempDir, "fixtures"),
      maxScrollPasses: 3,
      determinism: {},
      embeddingModel: "Xenova/all-MiniLM-L6-v2",
      embeddingRevision: "751bff37182d3f1213fa05d7196b954e230abad9",
      healing: { mode: "propose" },
      bands: { high: 0.7, medium: 0.5 },
      timeouts: { actionMs: 5000, navMs: 10000, hydrationNetworkIdleMs: 2000, hydrationQuietWindowMs: 150 },
      db: { readOnly: true },
    };
    container = buildContainer(config);
  });

  afterAll(async () => {
    await server.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("performs full authoring -> grounding -> execution -> healing cycle", async () => {
    // 1. Author Spec
    const rawSpec = {
      version: "1.0",
      flow: {
        id: "e2e-test",
        name: "E2E Test Flow",
        intent: "Login and verify dashboard",
        startUrl: `http://127.0.0.1:${PORT}/`,
        vars: {},
      },
      steps: [
        {
          id: "step-1",
          kind: "ui",
          action: "type",
          value: "test@example.com",
          intent: "enter email",
          target: {
            label: "Email Address",
            role: "textbox",
            semantics: ["email", "address"],
            actions: ["type"],
            intent: "enter email",
          },
        },
        {
          id: "step-2",
          kind: "ui",
          action: "click",
          intent: "click login button",
          target: {
            label: "Log In",
            role: "button",
            semantics: ["log in", "submit"],
            actions: ["click"],
            intent: "click login",
          },
        },
        {
          id: "step-3",
          kind: "ui",
          action: "wait",
          intent: "wait for navigation",
          assertions: [
            {
              type: "textContains",
              expected: "Welcome to Dashboard",
            },
          ],
        },
      ],
    };

    // Parse the SpecIR using Zod to ensure defaults are populated correctly
    const spec = SpecIR.parse(rawSpec);

    // 2. Ground the test spec
    const groundingResult = await container.grounding.ground(spec, {});
    expect(groundingResult.stoppedAt).toBeUndefined();

    const groundedStep2 = groundingResult.grounded.steps[1];
    expect(groundedStep2.kind).toBe("ui");
    if (groundedStep2.kind === "ui") {
      expect(groundedStep2.target?.resolution?.status).toBe("grounded");
      expect(groundedStep2.target?.resolution?.cachedSelector).not.toBeNull();
    }

    // 3. Save the grounded test to artifacts store
    await container.store.saveGrounded("e2e-test", groundingResult.grounded);

    // 4. Execute the grounded test (pass path)
    const report1 = await container.runner.run(groundingResult.grounded, {
      testId: "e2e-test",
    });
    expect(report1.status).toBe("passed");
    expect(report1.steps.every((s) => s.status === "passed")).toBe(true);

    // 5. Test Drift: Change element attributes to trigger runtime healing
    // Alter the login button text and ID so the grounded selector fails but the resolver recovers it
    pageHtml = `
      <html>
        <body>
          <div id="login-form">
            <label for="email-input">Email Address</label>
            <input type="text" id="email-input" value="">
            <button id="new-login-button" onclick="window.location.href='/dashboard'">Sign In</button>
          </div>
        </body>
      </html>
    `;

    // Execute again against the drifted UI.
    // The runner should encounter a selector miss, run the resolver to find "Sign In" as "Log In",
    // update the cache, and succeed.
    const report2 = await container.runner.run(groundingResult.grounded, {
      testId: "e2e-test",
    });
    expect(report2.status).toBe("passed");

    const step2Result = report2.steps.find((s) => s.stepId === "step-2");
    expect(step2Result).toBeDefined();
    expect(step2Result?.status).toBe("passed");
    expect(step2Result?.selection).toBe("resolver"); // verified it healed via resolver!

    // 6. Test Stale Escalation: Remove element entirely to verify stale failure
    pageHtml = `
      <html>
        <body>
          <div>Gone entirely</div>
        </body>
      </html>
    `;

    // Clear the selector cache so it doesn't reuse the healed selector
    await container.cache.clearSelectorsForTest("e2e-test");

    const report3 = await container.runner.run(groundingResult.grounded, {
      testId: "e2e-test",
    });
    expect(report3.status).toBe("failed");

    const step2ResultFail = report3.steps.find((s) => s.stepId === "step-2");
    expect(step2ResultFail?.status).toBe("stale"); // verified it escalated to stale!
  }, 30000);

  it("fails the step and persists no heal when the healed action misses the author's outcome", async () => {
    pageHtml = `<html><body>
      <button id="login-button" onclick="window.location.href='/dashboard'">Log In</button>
    </body></html>`;
    const spec = SpecIR.parse({
      version: "1.0",
      flow: {
        id: "wrong-heal",
        name: "wrong heal",
        intent: "login",
        startUrl: `http://127.0.0.1:${PORT}/`,
        vars: {},
      },
      steps: [
        {
          id: "s1",
          kind: "ui",
          action: "click",
          intent: "log in",
          target: {
            label: "Log In",
            role: "button",
            semantics: ["log in", "submit"],
            actions: ["click"],
            intent: "log in",
          },
          assertions: [{ type: "urlContains", expected: "/dashboard" }],
        },
      ],
    });
    const { grounded } = await container.grounding.ground(spec, {});
    // The real button disappears; a near-miss that goes somewhere else takes its place.
    pageHtml = `<html><body>
      <button id="help" onclick="window.location.href='/nowhere'">Log In Help</button>
    </body></html>`;
    const report = await container.runner.run(grounded, { testId: "wrong-heal" });
    expect(report.steps[0].status).not.toBe("passed");
    const heals = (await container.repairs.list("wrong-heal")).filter((r) => r.kind === "heal");
    expect(heals).toEqual([]);
  }, 30000);

  it("re-grounds only the patched step and replays the rest from stored selectors", async () => {
    pageHtml = `<html><body>
      <label for="email-input">Email Address</label><input type="text" id="email-input" value="">
      <button id="login-button" onclick="window.location.href='/dashboard'">Log In</button>
    </body></html>`;
    const mk = (loginLabel: string) =>
      SpecIR.parse({
        version: "1.0",
        flow: { id: "scoped", name: "s", intent: "s", startUrl: `http://127.0.0.1:${PORT}/`, vars: {} },
        steps: [
          { id: "a", kind: "ui", action: "type", value: "x@y.z", intent: "email",
            target: { label: "Email Address", role: "textbox", semantics: ["email"], actions: ["type"], intent: "email" } },
          { id: "b", kind: "ui", action: "click", intent: "login",
            target: { label: loginLabel, role: "button", semantics: ["log in"], actions: ["click"], intent: "login" } },
          { id: "c", kind: "ui", action: "wait", intent: "dash", assertions: [{ type: "textContains", expected: "Welcome to Dashboard" }] },
        ],
      });
    const full = await container.grounding.ground(mk("Log In"), {});
    const spy = vi.spyOn(container.resolver, "resolve");
    const scoped = await container.grounding.ground(mk("Log in button"), {
      only: ["b"],
      previous: full.grounded,
    });
    expect(scoped.fellBackToFull).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(scoped.candidates.steps.map((s) => s.stepId)).toEqual(["b"]);
    expect((scoped.grounded.steps[0] as any).target.resolution.cachedSelector).toBe(
      (full.grounded.steps[0] as any).target.resolution.cachedSelector,
    );
    spy.mockRestore();
  }, 30000);
});
