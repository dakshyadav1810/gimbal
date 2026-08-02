import type { RunReport } from "@gimbal/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "./db.js";
import { SqliteCacheStore } from "./index.js";
import { migrate } from "./migrate.js";

function makeStore(): SqliteCacheStore {
  const db = openDb(":memory:");
  migrate(db);
  return new SqliteCacheStore(db);
}

describe("SqliteCacheStore — resolution cache", () => {
  let store: SqliteCacheStore;
  beforeEach(() => {
    store = makeStore();
  });

  it("returns null for a selector that was never cached", () => {
    expect(store.getSelector("t1", "s1", "hash1")).toBeNull();
  });

  it("round-trips a cached selector", () => {
    store.putSelector({
      testId: "t1",
      stepId: "s1",
      domHash: "hash1",
      cachedSelector: "#email",
      band: "high",
    });
    const got = store.getSelector("t1", "s1", "hash1");
    expect(got).toMatchObject({
      testId: "t1",
      stepId: "s1",
      domHash: "hash1",
      cachedSelector: "#email",
      band: "high",
    });
  });

  it("upserts on conflict for the same (testId, stepId, domHash) key instead of erroring", () => {
    store.putSelector({
      testId: "t1",
      stepId: "s1",
      domHash: "hash1",
      cachedSelector: "#email",
      band: "high",
    });
    store.putSelector({
      testId: "t1",
      stepId: "s1",
      domHash: "hash1",
      cachedSelector: "#email-updated",
      band: "medium",
    });
    const got = store.getSelector("t1", "s1", "hash1");
    expect(got?.cachedSelector).toBe("#email-updated");
    expect(got?.band).toBe("medium");
  });

  it("keeps distinct domHash entries for the same test/step separate", () => {
    store.putSelector({
      testId: "t1",
      stepId: "s1",
      domHash: "hashA",
      cachedSelector: "#a",
      band: "high",
    });
    store.putSelector({
      testId: "t1",
      stepId: "s1",
      domHash: "hashB",
      cachedSelector: "#b",
      band: "high",
    });
    expect(store.getSelector("t1", "s1", "hashA")?.cachedSelector).toBe("#a");
    expect(store.getSelector("t1", "s1", "hashB")?.cachedSelector).toBe("#b");
  });

  it("clearSelectorsForTest removes every cached selector for that test, leaving other tests untouched", () => {
    store.putSelector({
      testId: "t1",
      stepId: "s1",
      domHash: "hash1",
      cachedSelector: "#a",
      band: "high",
    });
    store.putSelector({
      testId: "t1",
      stepId: "s2",
      domHash: "hash2",
      cachedSelector: "#b",
      band: "medium",
    });
    store.putSelector({
      testId: "t2",
      stepId: "s1",
      domHash: "hash1",
      cachedSelector: "#c",
      band: "high",
    });

    store.clearSelectorsForTest("t1");

    // regression: a re-ground must not leave a stale entry that a later runtime-heal cache hit
    // could pick up ahead of the freshly grounded selector
    expect(store.getSelector("t1", "s1", "hash1")).toBeNull();
    expect(store.getSelector("t1", "s2", "hash2")).toBeNull();
    expect(store.getSelector("t2", "s1", "hash1")).toMatchObject({
      cachedSelector: "#c",
    });
  });
});

describe("SqliteCacheStore — embeddings", () => {
  let store: SqliteCacheStore;
  beforeEach(() => {
    store = makeStore();
  });

  it("returns null for an embedding that was never cached", () => {
    expect(store.getEmbedding("nope")).toBeNull();
  });

  it("round-trips a Float32Array through the BLOB column without precision loss", () => {
    const vector = new Float32Array([0.1, -0.2, 3.5, 0, 1e-8]);
    store.putEmbedding("hash1", "model-a", vector);
    const got = store.getEmbedding("hash1");
    expect(got).not.toBeNull();
    expect(Array.from(got!)).toEqual(Array.from(vector));
  });

  it("does not overwrite an existing embedding for the same hash (onConflictDoNothing)", () => {
    store.putEmbedding("hash1", "model-a", new Float32Array([1, 2, 3]));
    store.putEmbedding("hash1", "model-b", new Float32Array([9, 9, 9]));
    const got = store.getEmbedding("hash1");
    expect(Array.from(got!)).toEqual([1, 2, 3]);
  });
});

describe("SqliteCacheStore — runs", () => {
  let store: SqliteCacheStore;
  beforeEach(() => {
    store = makeStore();
  });

  function report(overrides: Partial<RunReport> = {}): RunReport {
    return {
      runId: "r1",
      testId: "t1",
      status: "passed",
      needsReview: false,
      steps: [
        {
          stepId: "s1",
          status: "passed",
          selection: "cached",
          band: "high",
          durationMs: 120,
          screenshot: "r1/s1.jpg",
        },
        {
          stepId: "s2",
          status: "stale",
          durationMs: 45,
        },
        {
          stepId: "s3",
          status: "failed",
          durationMs: 15528,
          failure: {
            reason: "ACTION_FAILED",
            message: "locator.click: Timeout 15000ms exceeded",
          },
        },
      ],
      startedAt: "2026-07-28T00:00:00.000Z",
      finishedAt: "2026-07-28T00:00:05.000Z",
      ...overrides,
    };
  }

  it("returns null for a run that was never saved", () => {
    expect(store.getRun("missing")).toBeNull();
  });

  it("round-trips a full run report including all step results", () => {
    store.saveRun(report());
    const got = store.getRun("r1");
    expect(got).not.toBeNull();
    expect(got?.runId).toBe("r1");
    expect(got?.testId).toBe("t1");
    expect(got?.status).toBe("passed");
    expect(got?.steps).toHaveLength(3);
    expect(got?.steps[0]).toMatchObject({
      stepId: "s1",
      status: "passed",
      selection: "cached",
      band: "high",
      durationMs: 120,
      screenshot: "r1/s1.jpg",
    });
    // optional fields that were absent on the input step must come back as undefined, not null
    expect(got?.steps[1].selection).toBeUndefined();
    expect(got?.steps[1].band).toBeUndefined();
    expect(got?.steps[1].screenshot).toBeUndefined();
    expect(got?.steps[1].failure).toBeUndefined();
    // regression: failure.reason/message must round-trip through the cache, not be silently
    // dropped on save or reconstruction
    expect(got?.steps[2].failure).toEqual({
      reason: "ACTION_FAILED",
      message: "locator.click: Timeout 15000ms exceeded",
    });
  });

  it("lists runs for a test ordered most-recent-first, without the steps body", () => {
    store.saveRun(report({ runId: "r1", startedAt: "2026-07-28T00:00:00.000Z" }));
    store.saveRun(report({ runId: "r2", startedAt: "2026-07-28T01:00:00.000Z" }));
    store.saveRun(report({ runId: "r3", startedAt: "2026-07-27T23:00:00.000Z" }));
    const list = store.listRuns("t1");
    expect(list.map((r) => r.runId)).toEqual(["r2", "r1", "r3"]);
    expect(list.every((r) => !("steps" in r))).toBe(true);
  });

  it("scopes listRuns to the given testId", () => {
    store.saveRun(report({ runId: "r1", testId: "t1" }));
    store.saveRun(report({ runId: "r2", testId: "t2" }));
    expect(store.listRuns("t1").map((r) => r.runId)).toEqual(["r1"]);
    expect(store.listRuns("t2").map((r) => r.runId)).toEqual(["r2"]);
  });

  it("startRun creates a 'running' placeholder that getRun can already see mid-execution", () => {
    store.startRun("r1", "t1", "2026-07-28T00:00:00.000Z");
    const got = store.getRun("r1");
    expect(got).not.toBeNull();
    expect(got?.status).toBe("running");
    expect(got?.testId).toBe("t1");
    expect(got?.steps).toEqual([]);
  });

  it("saveRun overwrites the running placeholder in place (same runId) rather than erroring on conflict", () => {
    store.startRun("r1", "t1", "2026-07-28T00:00:00.000Z");
    store.saveRun(report({ runId: "r1" }));
    const got = store.getRun("r1");
    expect(got?.status).toBe("passed");
    expect(got?.steps).toHaveLength(3);
  });

  it("failRun marks a running placeholder 'failed' with a real finishedAt, for a run that crashed mid-execution", () => {
    store.startRun("r1", "t1", "2026-07-28T00:00:00.000Z");
    store.failRun("r1", "2026-07-28T00:00:02.000Z");
    const got = store.getRun("r1");
    expect(got?.status).toBe("failed");
    expect(got?.finishedAt).toBe("2026-07-28T00:00:02.000Z");
  });
});

describe("SqliteCacheStore — heal audit", () => {
  it("appends heal audit entries without throwing, including optional fields omitted", () => {
    const store = makeStore();
    expect(() =>
      store.appendHeal({
        testId: "t1",
        stepId: "s1",
        event: "healed",
        fromSel: "#old",
        toSel: "#new",
        band: "medium",
        reason: "dom drift",
        at: "2026-07-28T00:00:00.000Z",
      }),
    ).not.toThrow();
    expect(() =>
      store.appendHeal({
        testId: "t1",
        stepId: "s2",
        event: "stale",
        fromSel: null,
        toSel: null,
        at: "2026-07-28T00:00:00.000Z",
      }),
    ).not.toThrow();
  });
});

describe("SqliteCacheStore — review queue", () => {
  let store: SqliteCacheStore;
  beforeEach(() => {
    store = makeStore();
  });

  it("returns an empty list when nothing is queued", () => {
    expect(store.openReviews()).toEqual([]);
    expect(store.openReviews("t1")).toEqual([]);
  });

  it("enqueues and lists an open review, scoped or unscoped", () => {
    store.enqueueReview({
      testId: "t1",
      stepId: "s1",
      url: "https://app.test/sign-in",
      screenshotPath: "r1/s1.jpg",
      candidatesJson: "[]",
    });
    expect(store.openReviews("t1")).toHaveLength(1);
    expect(store.openReviews()).toHaveLength(1);
    expect(store.openReviews("other-test")).toEqual([]);
  });

  it("removes a review from the open list once resolved", () => {
    store.enqueueReview({ testId: "t1", stepId: "s1", url: "https://app.test/x" });
    expect(store.openReviews("t1")).toHaveLength(1);
    store.resolveReview("t1", "s1");
    expect(store.openReviews("t1")).toEqual([]);
  });

  it("resolveReview only closes the matching (testId, stepId) pair", () => {
    store.enqueueReview({ testId: "t1", stepId: "s1", url: "https://app.test/x" });
    store.enqueueReview({ testId: "t1", stepId: "s2", url: "https://app.test/y" });
    store.resolveReview("t1", "s1");
    const remaining = store.openReviews("t1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].stepId).toBe("s2");
  });
});
