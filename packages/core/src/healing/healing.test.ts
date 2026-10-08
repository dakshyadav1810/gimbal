import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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
import { RepairStore } from "../repairs/store.js";
import type { ArtifactStore } from "../storage/index.js";
import { audit } from "./audit.js";
import { CoreHealingService } from "./index.js";
import { buildRepairPayload, maintain } from "./repair.js";
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
    ...overrides,
  } as CacheStore;
}

const tmpRepairs = () =>
  new RepairStore(mkdtempSync(path.join(os.tmpdir(), "gimbal-repairs-")));

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

describe("runtimeHeal", () => {
  const page = {} as Page;

  it("caches the new selector and records a 'healed' audit event when reground clears medium/high band", async () => {
    const cache = fakeCache();
    const repairs = tmpRepairs();
    const grounding = {
      ground: vi.fn(),
      reground: vi.fn().mockResolvedValue({
        band: "high",
        cachedSelector: "#healed",
        resolution: {
          candidates: [],
          confidence: 0.9,
        } as unknown as Resolution,
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
      repairs,
    );

    expect(outcome).toMatchObject({
      status: "healed",
      cachedSelector: "#healed",
      band: "high",
      from: "#old",
    });
    // nothing is persisted until the caller has verified the healed action
    expect(cache.putSelector).not.toHaveBeenCalled();
    expect(await repairs.list("store-test-1")).toEqual([]);
    expect(outcome.status === "healed" && outcome.proposal).toMatchObject({
      kind: "heal",
      status: "proposed",
      stepId: "s1",
      before: { selector: "#old" },
      after: { selector: "#healed" },
    });
  });

  it("commitHeal writes the cache, audit log and repairs.json, keyed by the right ids", async () => {
    const cache = fakeCache();
    const repairs = tmpRepairs();
    const svc = new CoreHealingService(
      {} as GroundingService,
      cache,
      {} as AuthoringService,
      {} as ArtifactStore,
      repairs,
    );
    const heal = {
      status: "healed" as const,
      cachedSelector: "#healed",
      band: "high" as const,
      from: "#old",
      domHash: "h1",
      proposal: {
        testId: "store-test-1",
        stepId: "s1",
        kind: "heal" as const,
        status: "proposed" as const,
        before: { selector: "#old" },
        after: { selector: "#healed" },
      },
    };
    await svc.commitHeal(groundedTest(), "store-test-1", "s1", heal, {
      level: "effect",
      result: "verified",
    });
    // resolution_cache stays keyed by flow.id; audit and repairs use the storage-layer id.
    expect(cache.putSelector).toHaveBeenCalledWith(
      expect.objectContaining({ testId: "test-1", cachedSelector: "#healed" }),
    );
    expect(cache.appendHeal).toHaveBeenCalledWith(
      expect.objectContaining({
        testId: "store-test-1",
        event: "healed",
        toSel: "#healed",
      }),
    );
    const [saved] = await repairs.list("store-test-1");
    expect(saved.verification).toEqual({ level: "effect", result: "verified" });
  });

  it("records a needed repair and a 'stale' audit event when reground can't clear low band", async () => {
    const cache = fakeCache();
    const repairs = tmpRepairs();
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
      repairs,
    );

    expect(outcome.status).toBe("stale");
    expect(cache.putSelector).not.toHaveBeenCalled();
    // an abstention is recorded as a "needed" repair, keyed by the storage-layer testId
    const [needed] = await repairs.list("store-test-1");
    expect(needed).toMatchObject({
      kind: "needed",
      status: "needed",
      stepId: "s1",
      before: { selector: "#old" },
    });
    expect(cache.appendHeal).toHaveBeenCalledWith(
      expect.objectContaining({ testId: "store-test-1", event: "stale" }),
    );
  });

  it("treats a non-low band with no cachedSelector the same as low band (falls to stale)", async () => {
    const cache = fakeCache();
    const repairs = tmpRepairs();
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
      repairs,
    );
    expect(outcome.status).toBe("stale");
  });
});

describe("buildRepairPayload", () => {
  it("assembles specIR + testCase", async () => {
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
      saveAriaSnapshot: vi.fn(),
      loadAriaSnapshot: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    } as ArtifactStore;

    const payload = await buildRepairPayload(store, "t1");
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
      saveAriaSnapshot: vi.fn(),
      loadAriaSnapshot: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    } as ArtifactStore;
    const authoring = {
      submit: vi.fn().mockResolvedValue(patchedSpec),
      context: vi.fn(),
    } as AuthoringService;
    const grounding = {
      ground: vi
        .fn()
        .mockResolvedValue({ candidates: { steps: [] }, grounded: after }),
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
    expect(grounding.ground).toHaveBeenCalledWith(patchedSpec, {
      only: ["s1"],
      previous: expect.anything(),
    });
    expect(result).toEqual({ testId: "t1", before, after });
    expect(store.saveSpec).toHaveBeenCalledWith(patchedSpec, "t1");
    expect(store.saveGrounded).toHaveBeenCalledWith("t1", after);
  });
});
