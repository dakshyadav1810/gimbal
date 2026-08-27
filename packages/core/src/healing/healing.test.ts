import type {
  Candidate,
  GroundedTest,
  Resolution,
  SpecIR,
} from "@gimbal/shared";
import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import type { AuthoringService } from "../authoring/index.js";
import type { CacheStore } from "../cache/index.js";
import type { GroundingService, StepResolution } from "../grounding/index.js";
import type { ArtifactStore } from "../storage/index.js";
import { audit } from "./audit.js";
import { buildRepairPayload, maintain } from "./repair.js";
import { enqueue } from "./review.js";
import { runtimeHeal } from "./runtime.js";

function fakeCache(overrides: Partial<CacheStore> = {}): CacheStore {
  return {
    getSelector: vi.fn(),
    putSelector: vi.fn(),
    clearSelectorsForTest: vi.fn(),
    getEmbedding: vi.fn(),
    putEmbedding: vi.fn(),
    saveRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(),
    appendHeal: vi.fn(),
    enqueueReview: vi.fn(),
    resolveReview: vi.fn(),
    openReviews: vi.fn(),
    ...overrides,
  } as CacheStore;
}

function groundedTest(): GroundedTest {
  return {
    flow: { id: "test-1", name: "flow" },
    steps: [],
  } as unknown as GroundedTest;
}

describe("audit", () => {
  it("appends a heal-audit entry with null defaults for omitted from/to and a fresh timestamp", () => {
    const cache = fakeCache();
    audit(cache, "t1", "s1", "healed", { to: "#new", band: "high" });
    expect(cache.appendHeal).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: "t1",
        stepId: "s1",
        event: "healed",
        fromSel: null,
        toSel: "#new",
        band: "high",
      }),
    );
  });
});

describe("enqueue (review)", () => {
  it("serializes the top candidates as JSON onto the review record", () => {
    const cache = fakeCache();
    const candidates = [{ id: "c1" } as Candidate];
    enqueue(cache, "t1", "s1", "https://app.test/x", candidates);
    expect(cache.enqueueReview).toHaveBeenCalledWith({
      testId: "t1",
      stepId: "s1",
      url: "https://app.test/x",
      candidatesJson: JSON.stringify(candidates),
    });
  });
});

describe("runtimeHeal", () => {
  const page = {} as Page;

  it("caches the new selector and records a 'healed' audit event when reground clears medium/high band", async () => {
    const cache = fakeCache();
    const grounding = {
      ground: vi.fn(),
      reground: vi.fn().mockResolvedValue({
        band: "high",
        cachedSelector: "#healed",
        resolution: { candidates: [] } as unknown as Resolution,
        domHash: "hash1",
      } satisfies StepResolution),
    } as GroundingService;

    const outcome = await runtimeHeal(
      grounding,
      cache,
      groundedTest(),
      "s1",
      page,
      "#old",
      "store-test-1",
    );

    expect(outcome).toMatchObject({
      status: "healed",
      cachedSelector: "#healed",
      band: "high",
      from: "#old",
    });
    // resolution_cache stays keyed by flow.id, not the storage-layer testId.
    expect(cache.putSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: "test-1",
        stepId: "s1",
        cachedSelector: "#healed",
        band: "high",
      }),
    );
    // the audit log is looked up by the storage-layer testId elsewhere (verdict.ts), so it must
    // use storeTestId, not test.flow.id.
    expect(cache.appendHeal).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: "store-test-1",
        event: "healed",
        fromSel: "#old",
        toSel: "#healed",
      }),
    );
    expect(cache.enqueueReview).not.toHaveBeenCalled();
  });

  it("enqueues a review and records a 'stale' audit event when reground can't clear low band", async () => {
    const cache = fakeCache();
    const topCandidates = Array.from(
      { length: 8 },
      (_, i) => ({ id: `c${i}` }) as Candidate,
    );
    const grounding = {
      ground: vi.fn(),
      reground: vi.fn().mockResolvedValue({
        band: "low",
        cachedSelector: null,
        resolution: { candidates: topCandidates } as unknown as Resolution,
        domHash: "hash1",
      } satisfies StepResolution),
    } as GroundingService;
    const pageWithUrl = { url: () => "https://app.test/current" } as Page;

    const outcome = await runtimeHeal(
      grounding,
      cache,
      groundedTest(),
      "s1",
      pageWithUrl,
      "#old",
      "store-test-1",
    );

    expect(outcome.status).toBe("stale");
    expect(cache.putSelector).not.toHaveBeenCalled();
    // enqueue only keeps the top 5 candidates, not all resolution.candidates; keyed by the
    // storage-layer testId (not test.flow.id) so it matches how the review queue is looked up.
    expect(cache.enqueueReview).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: "store-test-1",
        stepId: "s1",
        url: "https://app.test/current",
        candidatesJson: JSON.stringify(topCandidates.slice(0, 5)),
      }),
    );
    expect(cache.appendHeal).toHaveBeenCalledWith(
      expect.objectContaining({ testId: "store-test-1", event: "stale" }),
    );
  });

  it("treats a non-low band with no cachedSelector the same as low band (falls to stale)", async () => {
    const cache = fakeCache();
    const grounding = {
      ground: vi.fn(),
      reground: vi.fn().mockResolvedValue({
        band: "medium",
        cachedSelector: null,
        resolution: { candidates: [] } as unknown as Resolution,
        domHash: "hash1",
      } satisfies StepResolution),
    } as GroundingService;
    const pageWithUrl = { url: () => "https://app.test/x" } as Page;

    const outcome = await runtimeHeal(
      grounding,
      cache,
      groundedTest(),
      "s1",
      pageWithUrl,
      null,
      "store-test-1",
    );
    expect(outcome.status).toBe("stale");
  });
});

describe("buildRepairPayload", () => {
  it("assembles specIR + testCase with a null kdg placeholder", async () => {
    const store = {
      loadSpec: vi
        .fn()
        .mockResolvedValue({ flow: { id: "t1" } } as unknown as SpecIR),
      loadGrounded: vi
        .fn()
        .mockResolvedValue({ flow: { id: "t1" } } as unknown as GroundedTest),
      loadCandidates: vi.fn().mockResolvedValue(null),
      saveSpec: vi.fn(),
      saveGrounded: vi.fn(),
      saveCandidates: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    } as ArtifactStore;

    const payload = await buildRepairPayload(store, "t1");
    expect(payload.kdg).toBeNull();
    expect(store.loadSpec).toHaveBeenCalledWith("t1");
    expect(store.loadGrounded).toHaveBeenCalledWith("t1");
  });
});

describe("maintain", () => {
  it("re-validates the agent-supplied patched spec, re-grounds it, and returns before/after", async () => {
    const before = {
      flow: { id: "t1" },
      steps: [{ id: "s1" }],
    } as unknown as GroundedTest;
    const after = {
      flow: { id: "t1" },
      steps: [{ id: "s1-fixed" }],
    } as unknown as GroundedTest;
    const patchedSpec = { flow: { id: "t1" } } as unknown as SpecIR;

    const store = {
      loadGrounded: vi.fn().mockResolvedValue(before),
      loadSpec: vi.fn(),
      loadCandidates: vi.fn().mockResolvedValue(null),
      saveSpec: vi.fn(),
      saveGrounded: vi.fn(),
      saveCandidates: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    } as ArtifactStore;
    const authoring = {
      submit: vi.fn().mockResolvedValue(patchedSpec),
      context: vi.fn(),
    } as AuthoringService;
    const grounding = {
      ground: vi.fn().mockResolvedValue({ candidates: {}, grounded: after }),
      reground: vi.fn(),
    } as unknown as GroundingService;

    const result = await maintain(
      authoring,
      grounding,
      store,
      "t1",
      ["s1"],
      patchedSpec,
    );

    expect(authoring.submit).toHaveBeenCalledWith(patchedSpec);
    expect(grounding.ground).toHaveBeenCalledWith(patchedSpec, {});
    expect(result).toEqual({ testId: "t1", before, after });
  });
});
