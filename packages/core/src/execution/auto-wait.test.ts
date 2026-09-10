import type { GimbalConfig, GroundedTest, GroundedUiStep } from "@gimbal/shared";
import type { Page } from "playwright";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheStore } from "../cache/index.js";
import type { HealingService } from "../healing/index.js";

// Mock locate() before importing the module under test.
vi.mock("../grounding/candidate.js", () => ({
  extractCandidatesWithScroll: vi.fn().mockResolvedValue([]),
}));
vi.mock("../grounding/dom-hash.js", () => ({
  computeDomHash: vi.fn().mockReturnValue("h1"),
}));
vi.mock("./locate.js", () => ({ locate: vi.fn() }));

const { locateWithStabilityGate } = await import("./auto-wait.js");
const { locate } = await import("./locate.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STABLE_BOX = { x: 10, y: 20, width: 100, height: 30 };

const SHORT_CONFIG: GimbalConfig = {
  port: 4319,
  browser: "chromium",
  headless: true,
  dbPath: ":memory:",
  artifactsDir: "/tmp",
    fixturesDir: "/tmp/fixtures",
  screenshotsDir: "/tmp",
  embeddingModel: "x",
  bands: { high: 0.7, medium: 0.5 },
  // Give enough time for tests that succeed, but short enough that the
  // timeout test completes quickly.
  timeouts: { actionMs: 2000, navMs: 5000, hydrationNetworkIdleMs: 2000, hydrationQuietWindowMs: 150 },
  db: { readOnly: true },
  maxScrollPasses: 3,
  determinism: {},
};

const TINY_CONFIG: GimbalConfig = {
  ...SHORT_CONFIG,
  timeouts: { ...SHORT_CONFIG.timeouts, actionMs: 80 },
};

function fakeTest(): GroundedTest {
  return {
    version: "1.0",
    flow: { id: "t1", name: "T", intent: "i", startUrl: "http://x", vars: {} },
    groundedUrl: "http://x",
    steps: [],
  } as unknown as GroundedTest;
}

function fakeStep(): GroundedUiStep {
  return {
    id: "s1",
    kind: "ui",
    action: "click",
    intent: "click",
    onFailure: "abort",
    preconditions: [],
    assertions: [],
    negative: false,
    generalization: "same_element",
    expectedOutcome: [],
  } as unknown as GroundedUiStep;
}

function fakeLocator() {
  return {
    count: () => Promise.resolve(1),
    isVisible: () => Promise.resolve(true),
  } as any;
}

function fakeCache(): CacheStore {
  return {
    getSelector: vi.fn().mockReturnValue(null),
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
    startRun: vi.fn(),
    failRun: vi.fn(),
  } as unknown as CacheStore;
}

function fakeHealing(): HealingService {
  return {
    runtimeHeal: vi
      .fn()
      .mockResolvedValue({ status: "stale", reason: "x", topCandidates: [] }),
    buildRepairPayload: vi.fn(),
    maintain: vi.fn(),
  } as unknown as HealingService;
}

// Build a fake page whose evaluate() returns bounding boxes for stage 2 then
// true for stage 3 (not occluded).
function makePage(evalResponses: unknown[]): Page {
  let call = 0;
  return {
    evaluate: vi.fn().mockImplementation(() => {
      const resp = evalResponses[call] ?? true;
      call++;
      return Promise.resolve(resp);
    }),
    locator: vi.fn().mockReturnValue(fakeLocator()),
    url: () => "http://x",
  } as unknown as Page;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("locateWithStabilityGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves immediately when locate succeeds on first try and element is already stable", async () => {
    (locate as any).mockResolvedValue({
      locator: fakeLocator(),
      selector: "#btn",
      source: "cached",
    });
    // evaluate returns: box1, box2 (stage 2 — identical → stable), true (stage 3 — not occluded)
    const page = makePage([STABLE_BOX, STABLE_BOX, true]);

    const result = await locateWithStabilityGate(
      fakeTest(), fakeStep(), page, fakeCache(), fakeHealing(), "tid", SHORT_CONFIG,
    );

    expect(result.source).toBe("cached");
    expect(result.selector).toBe("#btn");
  });

  it("invokes scrollIntoViewIfNeeded on target locator before evaluating stability", async () => {
    const scrollFn = vi.fn().mockResolvedValue(undefined);
    const locator = {
      ...fakeLocator(),
      scrollIntoViewIfNeeded: scrollFn,
    };
    (locate as any).mockResolvedValue({
      locator,
      selector: "#below-the-fold",
      source: "cached",
    });
    const page = makePage([STABLE_BOX, STABLE_BOX, true]);

    const result = await locateWithStabilityGate(
      fakeTest(), fakeStep(), page, fakeCache(), fakeHealing(), "tid", SHORT_CONFIG,
    );

    expect(scrollFn).toHaveBeenCalled();
    expect(result.selector).toBe("#below-the-fold");
  });

  it("polls stage 1 until locate returns a locator (delayed DOM appearance)", async () => {
    let calls = 0;
    (locate as any).mockImplementation(() => {
      calls++;
      if (calls < 4) return Promise.resolve({ locator: null, selector: null, source: "none" });
      return Promise.resolve({ locator: fakeLocator(), selector: "#btn", source: "resolver" });
    });
    const page = makePage([STABLE_BOX, STABLE_BOX, true]);

    const result = await locateWithStabilityGate(
      fakeTest(), fakeStep(), page, fakeCache(), fakeHealing(), "tid", SHORT_CONFIG,
    );

    expect(calls).toBeGreaterThanOrEqual(4);
    expect(result.source).toBe("resolver");
  });

  it("returns source 'none' when locate never resolves within the timeout budget", async () => {
    (locate as any).mockResolvedValue({ locator: null, selector: null, source: "none" });
    const page = makePage([]);

    const result = await locateWithStabilityGate(
      fakeTest(), fakeStep(), page, fakeCache(), fakeHealing(), "tid", TINY_CONFIG,
    );

    expect(result.source).toBe("none");
    expect(result.locator).toBeNull();
  });

  it("continues stage 2 polling while bounding box is still moving, resolves once stable", async () => {
    (locate as any).mockResolvedValue({
      locator: fakeLocator(),
      selector: "#btn",
      source: "cached",
    });
    // Boxes that move for two iterations then stabilise, then not-occluded
    const MOVED_BOX = { x: 10, y: 20, width: 105, height: 30 }; // width shifted
    const page = makePage([
      STABLE_BOX, MOVED_BOX,   // iteration 1: unstable
      STABLE_BOX, STABLE_BOX,  // iteration 2: stable
      true,                     // stage 3: not occluded
    ]);

    const result = await locateWithStabilityGate(
      fakeTest(), fakeStep(), page, fakeCache(), fakeHealing(), "tid", SHORT_CONFIG,
    );

    expect(result.source).toBe("cached");
  });

  it("continues stage 3 polling while element is occluded, resolves once clear", async () => {
    (locate as any).mockResolvedValue({
      locator: fakeLocator(),
      selector: "#btn",
      source: "cached",
    });
    // Stage 2 stable immediately, stage 3 occluded twice then clear
    const page = makePage([
      STABLE_BOX, STABLE_BOX, // stage 2 stable
      false, false, true,      // stage 3: occluded × 2, then clear
    ]);

    const result = await locateWithStabilityGate(
      fakeTest(), fakeStep(), page, fakeCache(), fakeHealing(), "tid", SHORT_CONFIG,
    );

    expect(result.source).toBe("cached");
  });
});
