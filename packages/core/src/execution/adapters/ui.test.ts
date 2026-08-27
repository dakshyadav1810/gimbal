import type { UiStep } from "@gimbal/shared";
import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import {
  awaitNavigationIfExpected,
  expectsNavigation,
  waitForPendingUiToClear,
} from "./ui.js";

function step(overrides: Partial<UiStep>): UiStep {
  return {
    id: "s1",
    intent: "test",
    onFailure: "abort",
    preconditions: [],
    assertions: [],
    negative: false,
    kind: "ui",
    action: "click",
    generalization: "same_element",
    expectedOutcome: [],
    ...overrides,
  };
}

describe("expectsNavigation", () => {
  it("is true when expectedOutcome includes navigation", () => {
    expect(
      expectsNavigation(step({ expectedOutcome: [{ type: "navigation" }] })),
    ).toBe(true);
  });

  it("is true when expectedOutcome includes url_change", () => {
    expect(
      expectsNavigation(
        step({
          expectedOutcome: [{ type: "url_change", value: "/dashboard" }],
        }),
      ),
    ).toBe(true);
  });

  it("is true when an assertion is urlContains", () => {
    expect(
      expectsNavigation(
        step({ assertions: [{ type: "urlContains", expected: "/app" }] }),
      ),
    ).toBe(true);
  });

  it("is false for a plain click with no navigation-related outcome or assertion", () => {
    expect(
      expectsNavigation(
        step({
          expectedOutcome: [{ type: "text_contains", value: "Saved" }],
          assertions: [
            {
              type: "elementVisible",
              target: {
                label: "Toast",
                semantics: [],
                role: "status",
                actions: [],
                intent: "confirm",
              },
            },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe("awaitNavigationIfExpected", () => {
  it("does not call waitForURL when the step has no navigation expectation", async () => {
    const waitForURL = vi.fn().mockResolvedValue(undefined);
    const page = { waitForURL } as unknown as Page;
    await awaitNavigationIfExpected(step({}), page, "https://app.test/sign-in");
    expect(waitForURL).not.toHaveBeenCalled();
  });

  it("calls waitForURL with a predicate against the pre-action URL when navigation is expected", async () => {
    const waitForURL = vi.fn().mockResolvedValue(undefined);
    const page = { waitForURL } as unknown as Page;
    await awaitNavigationIfExpected(
      step({ expectedOutcome: [{ type: "navigation" }] }),
      page,
      "https://app.test/sign-in",
    );
    expect(waitForURL).toHaveBeenCalledTimes(1);
    const predicate = waitForURL.mock.calls[0][0] as (url: URL) => boolean;
    expect(predicate(new URL("https://app.test/dashboard"))).toBe(true);
    expect(predicate(new URL("https://app.test/sign-in"))).toBe(false);
  });

  it("swallows a waitForURL timeout instead of throwing (e.g. a negative test where no redirect occurs)", async () => {
    const waitForURL = vi
      .fn()
      .mockRejectedValue(new Error("Timeout waiting for URL"));
    const page = { waitForURL } as unknown as Page;
    await expect(
      awaitNavigationIfExpected(
        step({ assertions: [{ type: "urlContains", expected: "/app" }] }),
        page,
        "https://app.test/sign-in",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("waitForPendingUiToClear", () => {
  it("queries for aria-busy/disabled/data-loading indicators and waits for detachment", async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const first = vi.fn().mockReturnValue({ waitFor });
    const locator = vi.fn().mockReturnValue({ first });
    const page = { locator } as unknown as Page;

    await waitForPendingUiToClear(page);

    expect(locator).toHaveBeenCalledWith(
      '[aria-busy="true"], button[disabled], [data-loading="true"]',
    );
    expect(first).toHaveBeenCalled();
    expect(waitFor).toHaveBeenCalledWith({ state: "detached", timeout: 3000 });
  });

  it("resolves immediately (no indicator ever present) without throwing", async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const page = {
      locator: () => ({ first: () => ({ waitFor }) }),
    } as unknown as Page;
    await expect(waitForPendingUiToClear(page)).resolves.toBeUndefined();
  });

  it("swallows a timeout (indicator attached but never detached) instead of throwing", async () => {
    const waitFor = vi
      .fn()
      .mockRejectedValue(new Error("Timeout waiting for detached"));
    const page = {
      locator: () => ({ first: () => ({ waitFor }) }),
    } as unknown as Page;
    await expect(waitForPendingUiToClear(page)).resolves.toBeUndefined();
  });
});
