import type {
  GimbalConfig,
  GroundedTest,
  Step,
  WsMessage,
} from "@gimbal/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheStore } from "../cache/index.js";
import type { HealingService } from "../healing/index.js";

vi.mock("./playwright.js", () => ({
  openSession: vi.fn().mockResolvedValue({
    page: { goto: vi.fn().mockResolvedValue(undefined) },
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

const dbFixtureMock = {
  beginFixture: vi.fn().mockResolvedValue(undefined),
  rollback: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({}),
};
const openDbSessionMock = vi.fn().mockReturnValue(null);
vi.mock("./db-client.js", () => ({
  openDbSession: (...args: unknown[]) => openDbSessionMock(...args),
}));

const { PlaywrightTestRunner } = await import("./dispatcher.js");
const { DbAdapter } = await import("./adapters/db.js");

function config(): GimbalConfig {
  return {
    port: 4319,
    browser: "chromium",
    headless: true,
    dbPath: ":memory:",
    artifactsDir: "/tmp/artifacts",
    fixturesDir: "/tmp/fixtures",
    maxScrollPasses: 3,
    screenshotsDir: "/tmp/screenshots",
    embeddingModel: "x",
    bands: { high: 0.7, medium: 0.5 },
    timeouts: {
      actionMs: 15000,
      navMs: 30000,
      hydrationNetworkIdleMs: 2000,
      hydrationQuietWindowMs: 150,
    },
    db: { readOnly: true },
    determinism: {},
  };
}

function dbStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "s1",
    intent: "check row",
    onFailure: "abort",
    preconditions: [],
    assertions: [],
    negative: false,
    kind: "db",
    query: "select 1",
    ...overrides,
  } as Step;
}

function groundedTest(steps: Step[]): GroundedTest {
  return {
    version: "1.0",
    flow: {
      id: "flow-1",
      name: "test",
      intent: "x",
      startUrl: "https://app.test/",
      vars: {},
    },
    groundedAt: "2026-07-28T00:00:00.000Z",
    groundedUrl: "https://app.test/",
    steps,
  } as unknown as GroundedTest;
}

function fakeCache(): CacheStore {
  return {
    getSelector: vi.fn(),
    putSelector: vi.fn(),
    clearSelectorsForTest: vi.fn(),
    getEmbedding: vi.fn(),
    putEmbedding: vi.fn(),
    startRun: vi.fn(),
    saveRun: vi.fn(),
    failRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(),
    appendHeal: vi.fn(),
    enqueueReview: vi.fn(),
    resolveReview: vi.fn(),
    openReviews: vi.fn(),
  } as unknown as CacheStore;
}

function fakeHealing(): HealingService {
  return {
    runtimeHeal: vi.fn(),
    buildRepairPayload: vi.fn(),
    maintain: vi.fn(),
  } as unknown as HealingService;
}

describe("PlaywrightTestRunner", () => {
  beforeEach(() => {
    openDbSessionMock.mockReset().mockReturnValue(null);
    dbFixtureMock.beginFixture.mockClear();
    dbFixtureMock.rollback.mockClear();
    dbFixtureMock.close.mockClear();
  });

  it("begins a DB fixture transaction before the run and rolls it back after, pass or fail", async () => {
    openDbSessionMock.mockReturnValue(dbFixtureMock);
    const runner = new PlaywrightTestRunner(
      config(),
      fakeCache(),
      fakeHealing(),
    );
    await runner.run(groundedTest([dbStep()]), { testId: "t1" });
    expect(dbFixtureMock.beginFixture).toHaveBeenCalled();
    expect(dbFixtureMock.rollback).toHaveBeenCalled();
    expect(dbFixtureMock.close).toHaveBeenCalled();

    // Rollback must run even when a step throws unexpectedly (see the "marks the run 'failed'"
    // test below for the throwing adapter) — verified separately since it needs its own adapter.
  });

  it("does not touch the DB fixture wrapper when config.db.url is unset (openDbSession returns null)", async () => {
    const runner = new PlaywrightTestRunner(
      config(),
      fakeCache(),
      fakeHealing(),
    );
    await runner.run(groundedTest([dbStep()]), { testId: "t1" });
    expect(dbFixtureMock.beginFixture).not.toHaveBeenCalled();
    expect(dbFixtureMock.rollback).not.toHaveBeenCalled();
  });

  it("runs all steps, aggregates a passing report, and persists it via cache.saveRun", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const executeSpy = vi
      .spyOn(DbAdapter.prototype, "execute")
      .mockResolvedValue({ stepId: "s1", status: "passed", durationMs: 1 });
    const test = groundedTest([dbStep({ id: "s1" })]);

    const report = await runner.run(test, { testId: "t1" });

    expect(report.status).toBe("passed");
    expect(report.steps).toHaveLength(1);
    expect(cache.saveRun).toHaveBeenCalledWith(report);
    executeSpy.mockRestore();
  });

  it("retries a failed step exactly once when onFailure is retry_once, and keeps the retry's own result", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const executeSpy = vi
      .spyOn(DbAdapter.prototype, "execute")
      .mockResolvedValueOnce({
        stepId: "s1",
        status: "failed",
        durationMs: 1,
        failure: { reason: "X", message: "first" },
      })
      .mockResolvedValueOnce({ stepId: "s1", status: "passed", durationMs: 1 });
    const test = groundedTest([dbStep({ id: "s1", onFailure: "retry_once" })]);

    const report = await runner.run(test, { testId: "t1" });

    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0].status).toBe("passed"); // the retry's result, not the first failure
    executeSpy.mockRestore();
  });

  it("does not retry a second time even if the retry also fails", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const executeSpy = vi
      .spyOn(DbAdapter.prototype, "execute")
      .mockResolvedValue({
        stepId: "s1",
        status: "failed",
        durationMs: 1,
        failure: { reason: "X", message: "still failing" },
      });
    const test = groundedTest([dbStep({ id: "s1", onFailure: "retry_once" })]);

    const report = await runner.run(test, { testId: "t1" });

    expect(executeSpy).toHaveBeenCalledTimes(2); // original + exactly one retry, never a third attempt
    expect(report.steps[0].status).toBe("failed");
    executeSpy.mockRestore();
  });

  it("downgrades a failed optional step to 'warning' and does not abort the run", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const test = groundedTest([
      dbStep({ id: "s1", onFailure: "optional" }), // fails: NO_DB_CONFIGURED (no dbQuery wired)
      dbStep({ id: "s2", onFailure: "abort" }),
    ]);

    const report = await runner.run(test, { testId: "t1" });

    expect(report.steps[0].status).toBe("warning");
    expect(report.steps).toHaveLength(2); // run continued past the optional failure
  });

  it("stops the run at the first fatal (onFailure: abort) failure and does not execute later steps", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const test = groundedTest([
      dbStep({ id: "s1", onFailure: "abort" }), // fails: NO_DB_CONFIGURED
      dbStep({ id: "s2", onFailure: "abort" }),
    ]);

    const report = await runner.run(test, { testId: "t1" });

    expect(report.steps).toHaveLength(1);
    expect(report.steps[0].stepId).toBe("s1");
    expect(report.status).toBe("failed");
  });

  it("emits run.start, step.start, step.result per step, and run.complete in order", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const test = groundedTest([dbStep({ id: "s1" })]);
    const emitted: WsMessage["type"][] = [];
    const emit = vi.fn((m: WsMessage) => emitted.push(m.type));

    await runner.run(test, { testId: "t1", emit });

    expect(emitted).toEqual([
      "run.start",
      "step.start",
      "step.result",
      "run.complete",
    ]);
  });

  it("uses the supplied runId, or generates one if omitted", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const test = groundedTest([dbStep({ id: "s1" })]);

    const withId = await runner.run(test, {
      testId: "t1",
      runId: "fixed-run-id",
    });
    expect(withId.runId).toBe("fixed-run-id");

    const withoutId = await runner.run(test, { testId: "t1" });
    expect(typeof withoutId.runId).toBe("string");
    expect(withoutId.runId).not.toBe("fixed-run-id");
  });

  it("merges flow.vars with the caller-supplied vars, caller vars taking precedence", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const test = groundedTest([dbStep({ id: "s1" })]);
    test.flow.vars = { a: "flow-value", b: "flow-b" };

    let capturedVars: Record<string, string> | undefined;
    const executeSpy = vi
      .spyOn(DbAdapter.prototype, "execute")
      .mockImplementation(async (_step, ctx) => {
        capturedVars = ctx.vars;
        return { stepId: "s1", status: "passed", durationMs: 1 };
      });

    await runner.run(test, { testId: "t1", vars: { a: "override" } });

    expect(capturedVars).toEqual({ a: "override", b: "flow-b" });
    executeSpy.mockRestore();
  });

  it("starts a 'running' placeholder row before executing steps, then persists the final report", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const executeSpy = vi
      .spyOn(DbAdapter.prototype, "execute")
      .mockImplementation(async () => {
        // startRun must have already been called by the time a step executes.
        expect(cache.startRun).toHaveBeenCalledWith(
          "fixed-run-id",
          "t1",
          expect.any(String),
        );
        expect(cache.saveRun).not.toHaveBeenCalled();
        return { stepId: "s1", status: "passed", durationMs: 1 };
      });
    const test = groundedTest([dbStep({ id: "s1" })]);

    const report = await runner.run(test, {
      testId: "t1",
      runId: "fixed-run-id",
    });

    expect(cache.saveRun).toHaveBeenCalledWith(report);
    expect(cache.failRun).not.toHaveBeenCalled();
    executeSpy.mockRestore();
  });

  it("marks the run 'failed' via cache.failRun and rethrows when a step throws unexpectedly, without ever calling saveRun", async () => {
    const cache = fakeCache();
    const runner = new PlaywrightTestRunner(config(), cache, fakeHealing());
    const executeSpy = vi
      .spyOn(DbAdapter.prototype, "execute")
      .mockRejectedValue(new Error("adapter blew up"));
    const test = groundedTest([dbStep({ id: "s1" })]);

    await expect(
      runner.run(test, { testId: "t1", runId: "fixed-run-id" }),
    ).rejects.toThrow("adapter blew up");

    expect(cache.failRun).toHaveBeenCalledWith(
      "fixed-run-id",
      expect.any(String),
    );
    expect(cache.saveRun).not.toHaveBeenCalled();
    executeSpy.mockRestore();
  });

  it("still rolls back the DB fixture transaction when a step throws unexpectedly", async () => {
    openDbSessionMock.mockReturnValue(dbFixtureMock);
    const runner = new PlaywrightTestRunner(
      config(),
      fakeCache(),
      fakeHealing(),
    );
    const executeSpy = vi
      .spyOn(DbAdapter.prototype, "execute")
      .mockRejectedValue(new Error("adapter blew up"));
    const test = groundedTest([dbStep({ id: "s1" })]);

    await expect(runner.run(test, { testId: "t1" })).rejects.toThrow(
      "adapter blew up",
    );

    expect(dbFixtureMock.beginFixture).toHaveBeenCalled();
    expect(dbFixtureMock.rollback).toHaveBeenCalled();
    expect(dbFixtureMock.close).toHaveBeenCalled();
    executeSpy.mockRestore();
  });
});
