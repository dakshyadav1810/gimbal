import type { Band, GroundedTest, GroundedUiStep } from "@gimbal/shared";
import type { Locator, Page } from "playwright";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheStore } from "../cache/index.js";
import type { HealingService } from "../healing/index.js";

vi.mock("../grounding/candidate.js", () => ({
  extractCandidates: vi.fn().mockResolvedValue([]),
}));
vi.mock("../grounding/dom-hash.js", () => ({
  computeDomHash: vi.fn().mockReturnValue("dom-hash-1"),
}));

const { locate } = await import("./locate.js");

function fakeLocator(
  overrides: Partial<{ count: number; visible: boolean }> = {},
): Locator {
  const { count = 1, visible = true } = overrides;
  return {
    count: () => Promise.resolve(count),
    isVisible: () => Promise.resolve(visible),
  } as unknown as Locator;
}

function fakePage(locators: Record<string, Locator>): Page {
  return {
    locator: (selector: string) =>
      locators[selector] ?? fakeLocator({ count: 0 }),
    url: () => "https://app.test/",
  } as unknown as Page;
}

function groundedTest(): GroundedTest {
  return {
    flow: { id: "test-1", name: "flow" },
    steps: [],
  } as unknown as GroundedTest;
}

function uiStep(overrides: Partial<GroundedUiStep> = {}): GroundedUiStep {
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
    ...overrides,
  } as unknown as GroundedUiStep;
}

function fakeCache(overrides: Partial<CacheStore> = {}): CacheStore {
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
    ...overrides,
  } as CacheStore;
}

function fakeHealing(overrides: Partial<HealingService> = {}): HealingService {
  return {
    runtimeHeal: vi
      .fn()
      .mockResolvedValue({ status: "stale", reason: "x", topCandidates: [] }),
    buildRepairPayload: vi.fn(),
    maintain: vi.fn(),
    ...overrides,
  } as HealingService;
}

describe("locate", () => {
  it("uses the cache hit directly when it resolves to a unique, visible element", async () => {
    const cache = fakeCache({
      getSelector: vi.fn().mockReturnValue({
        testId: "test-1",
        stepId: "s1",
        domHash: "dom-hash-1",
        cachedSelector: "#cached",
        band: "high" as Band,
      }),
    });
    const page = fakePage({
      "#cached": fakeLocator({ count: 1, visible: true }),
    });
    const result = await locate(
      groundedTest(),
      uiStep(),
      page,
      cache,
      fakeHealing(),
      "store-test-1",
    );
    expect(result.source).toBe("cached");
    expect(result.locator).not.toBeNull();
    expect(result.selector).toBe("#cached");
  });

  it("falls through to the grounded-artifact seed selector when the cache hit is not unique/visible", async () => {
    const cache = fakeCache({
      getSelector: vi.fn().mockReturnValue({
        testId: "test-1",
        stepId: "s1",
        domHash: "dom-hash-1",
        cachedSelector: "#stale-cached",
        band: "high" as Band,
      }),
    });
    const page = fakePage({
      "#stale-cached": fakeLocator({ count: 0 }),
      "#seed": fakeLocator({ count: 1, visible: true }),
    });
    const step = uiStep({
      target: {
        label: "Submit",
        semantics: [],
        role: "button",
        actions: [],
        intent: "submit",
        resolution: {
          status: "grounded",
          confidence: 0.9,
          band: "high",
          selected: "c1",
          cachedSelector: "#seed",
          winner: null,
        },
      },
    } as unknown as Partial<GroundedUiStep>);
    const result = await locate(
      groundedTest(),
      step,
      page,
      cache,
      fakeHealing(),
      "store-test-1",
    );
    expect(result.source).toBe("cached");
    expect(cache.putSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        cachedSelector: "#seed",
        domHash: "dom-hash-1",
      }),
    );
    // Regression: a caller must act on the selector that actually resolved (the seed), not the
    // stale cache hit that just failed isUniqueVisible.
    expect(result.selector).toBe("#seed");
  });

  it("falls through to runtime healing when neither the cache nor the seed selector resolve", async () => {
    const cache = fakeCache();
    const page = fakePage({});
    const healing = fakeHealing({
      runtimeHeal: vi.fn().mockResolvedValue({
        status: "healed",
        cachedSelector: "#healed",
        band: "medium" as Band,
        from: null,
      }),
    });
    const result = await locate(
      groundedTest(),
      uiStep(),
      page,
      cache,
      healing,
      "store-test-1",
    );
    expect(healing.runtimeHeal).toHaveBeenCalled();
    expect(result.source).toBe("resolver");
    expect(result.locator).not.toBeNull();
    expect(result.selector).toBe("#healed");
  });

  it("returns source 'none' with a null locator when healing also reports stale", async () => {
    const cache = fakeCache();
    const page = fakePage({});
    const healing = fakeHealing({
      runtimeHeal: vi.fn().mockResolvedValue({
        status: "stale",
        reason: "no match",
        topCandidates: [],
      }),
    });
    const result = await locate(
      groundedTest(),
      uiStep(),
      page,
      cache,
      healing,
      "store-test-1",
    );
    expect(result.source).toBe("none");
    expect(result.locator).toBeNull();
    expect(result.selector).toBeNull();
  });
});
