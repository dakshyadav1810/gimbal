import type { GimbalConfig } from "@gimbal/shared";
import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { hydrationTimeoutsFrom, waitForPageHydration } from "./hydration.js";

function config(overrides: Partial<GimbalConfig["timeouts"]> = {}): GimbalConfig {
  return {
    timeouts: {
      actionMs: 15000,
      navMs: 30000,
      hydrationNetworkIdleMs: 2000,
      hydrationQuietWindowMs: 150,
      ...overrides,
    },
  } as unknown as GimbalConfig;
}

describe("hydrationTimeoutsFrom", () => {
  it("derives networkIdleMs/quietWindowMs from config.timeouts", () => {
    expect(
      hydrationTimeoutsFrom(config({ hydrationNetworkIdleMs: 9000, hydrationQuietWindowMs: 400 })),
    ).toEqual({ networkIdleMs: 9000, quietWindowMs: 400 });
  });
});

describe("waitForPageHydration", () => {
  // Regression test: every real call site in the codebase previously omitted the third argument
  // entirely, so a project's configured hydrationNetworkIdleMs/hydrationQuietWindowMs had zero
  // effect and the wait always used the hardcoded 2000ms/150ms defaults regardless of config.
  it("honors a configured networkIdleMs instead of the hardcoded default", async () => {
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const page = { waitForLoadState, evaluate } as unknown as Page;

    // timeoutMs (the caller's own action-timeout budget) is 10000 here, comfortably above the
    // configured networkIdleMs, so the configured value is what actually gets used as the cap —
    // previously this would always have been 2000 regardless of what's configured.
    await waitForPageHydration(
      page,
      10000,
      hydrationTimeoutsFrom(config({ hydrationNetworkIdleMs: 9000 })),
    );

    expect(waitForLoadState).toHaveBeenCalledWith("networkidle", {
      timeout: 9000,
    });
  });

  it("still caps at the smaller of timeoutMs and the configured networkIdleMs", async () => {
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const page = { waitForLoadState, evaluate } as unknown as Page;

    await waitForPageHydration(
      page,
      500,
      hydrationTimeoutsFrom(config({ hydrationNetworkIdleMs: 9000 })),
    );

    expect(waitForLoadState).toHaveBeenCalledWith("networkidle", {
      timeout: 500,
    });
  });

  it("passes the configured quietWindowMs into the in-page MutationObserver evaluate call", async () => {
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const page = { waitForLoadState, evaluate } as unknown as Page;

    await waitForPageHydration(
      page,
      undefined,
      hydrationTimeoutsFrom(config({ hydrationQuietWindowMs: 777 })),
    );

    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), 777);
  });

  it("falls back to the documented 2000ms/150ms defaults when no override is given", async () => {
    const waitForLoadState = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const page = { waitForLoadState, evaluate } as unknown as Page;

    await waitForPageHydration(page);

    expect(waitForLoadState).toHaveBeenCalledWith("networkidle", {
      timeout: 2000,
    });
    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), 150);
  });
});
