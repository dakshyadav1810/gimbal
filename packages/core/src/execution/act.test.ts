import type { UiStep } from "@gimbal/shared";
import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { act } from "./act.js";

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

function fakeLocator(attrs: Record<string, string | null> = {}) {
  return {
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
    pressSequentially: vi.fn().mockResolvedValue(undefined),
    inputValue: vi.fn().mockResolvedValue(null),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    getAttribute: vi.fn((name: string) => Promise.resolve(attrs[name] ?? null)),
  };
}

function fakePage(locator = fakeLocator()) {
  let currentUrl = "https://app.test/current";
  // goto() lands on the requested URL by default — tests simulating a server-side redirect
  // override `url` afterward (via url.mockReturnValue(...)) to land somewhere else instead.
  const goto = vi.fn().mockImplementation((target: string) => {
    currentUrl = target;
    return Promise.resolve();
  });
  const waitForTimeout = vi.fn().mockResolvedValue(undefined);
  const url = vi.fn().mockImplementation(() => currentUrl);
  const first = vi.fn().mockReturnValue(locator);
  const locatorFn = vi.fn().mockReturnValue({ first });
  const page = {
    goto,
    waitForTimeout,
    url,
    locator: locatorFn,
  } as unknown as Page;
  return { page, locator, goto, waitForTimeout, url, locatorFn, first };
}

describe("act — navigate/wait (no selector required)", () => {
  it("navigate goes to the interpolated value", async () => {
    const { page, goto } = fakePage();
    await act(
      page,
      step({ action: "navigate", value: "https://app.test/${slug}" }),
      null,
      {
        slug: "dashboard",
      },
    );
    expect(goto).toHaveBeenCalledWith("https://app.test/dashboard", {
      waitUntil: "domcontentloaded",
    });
  });

  it("navigate falls back to the current page URL when value is empty", async () => {
    const { page, goto, url } = fakePage();
    await act(page, step({ action: "navigate", value: "" }), null, {});
    expect(goto).toHaveBeenCalledWith("https://app.test/current", {
      waitUntil: "domcontentloaded",
    });
    expect(url).toHaveBeenCalled();
  });

  it("navigate throws when the page lands somewhere other than the intended URL (e.g. an auth redirect)", async () => {
    const { page, url } = fakePage();
    url.mockReturnValue("https://app.test/sign-in");
    await expect(
      act(
        page,
        step({
          action: "navigate",
          value: "https://app.test/dashboard/notes/new",
        }),
        null,
        {},
      ),
    ).rejects.toThrow(/landed on https:\/\/app\.test\/sign-in/);
  });

  it("navigate does not throw when landing on the same origin+pathname with different query/hash", async () => {
    const { page, url } = fakePage();
    url.mockReturnValue("https://app.test/dashboard?tab=notes#top");
    await expect(
      act(
        page,
        step({ action: "navigate", value: "https://app.test/dashboard" }),
        null,
        {},
      ),
    ).resolves.toBeUndefined();
  });

  it("wait pauses for the numeric value in ms", async () => {
    const { page, waitForTimeout } = fakePage();
    await act(page, step({ action: "wait", value: "1200" }), null, {});
    expect(waitForTimeout).toHaveBeenCalledWith(1200);
  });

  it("wait defaults to 500ms when the value isn't a valid number", async () => {
    const { page, waitForTimeout } = fakePage();
    await act(page, step({ action: "wait", value: undefined }), null, {});
    expect(waitForTimeout).toHaveBeenCalledWith(500);
  });
});

describe("act — selector-based actions", () => {
  it("throws when a target action has no resolved selector", async () => {
    const { page } = fakePage();
    await expect(
      act(page, step({ action: "click" }), null, {}),
    ).rejects.toThrow(/requires a resolved selector/);
  });

  it("click resolves the selector via .first() and clicks it", async () => {
    const { page, locator, locatorFn, first } = fakePage();
    await act(page, step({ action: "click" }), "#submit", {});
    expect(locatorFn).toHaveBeenCalledWith("#submit");
    expect(first).toHaveBeenCalled();
    expect(locator.click).toHaveBeenCalledTimes(1);
  });

  it("skips the click when the target already has aria-expanded=true (Radix-style open trigger)", async () => {
    const locator = fakeLocator({ "aria-expanded": "true" });
    const { page } = fakePage(locator);
    await act(page, step({ action: "click" }), "#menu-trigger", {});
    expect(locator.click).not.toHaveBeenCalled();
  });

  it("skips the click when the target already has data-state=open (Radix DropdownMenuTrigger)", async () => {
    const locator = fakeLocator({ "data-state": "open" });
    const { page } = fakePage(locator);
    await act(page, step({ action: "click" }), "#menu-trigger", {});
    expect(locator.click).not.toHaveBeenCalled();
  });

  it("still clicks a closed toggle (aria-expanded=false, data-state=closed)", async () => {
    const locator = fakeLocator({
      "aria-expanded": "false",
      "data-state": "closed",
    });
    const { page } = fakePage(locator);
    await act(page, step({ action: "click" }), "#menu-trigger", {});
    expect(locator.click).toHaveBeenCalledTimes(1);
  });

  it("still clicks when getAttribute rejects (non-Radix element with no such attributes)", async () => {
    const locator = {
      click: vi.fn().mockResolvedValue(undefined),
      getAttribute: vi.fn().mockRejectedValue(new Error("detached")),
    };
    const { page } = fakePage(locator as any);
    await act(page, step({ action: "click" }), "#plain-button", {});
    expect(locator.click).toHaveBeenCalledTimes(1);
  });

  it("type fills the interpolated value", async () => {
    const { page, locator } = fakePage();
    await act(page, step({ action: "type", value: "hi ${name}" }), "#msg", {
      name: "Dana",
    });
    expect(locator.fill).toHaveBeenCalledWith("hi Dana");
  });

  it("type interpolation leaves unknown ${vars} as empty string", async () => {
    const { page, locator } = fakePage();
    await act(page, step({ action: "type", value: "${missing}" }), "#msg", {});
    expect(locator.fill).toHaveBeenCalledWith("");
  });

  it("select chooses the interpolated option", async () => {
    const { page, locator } = fakePage();
    await act(page, step({ action: "select", value: "${plan}" }), "#plan", {
      plan: "pro",
    });
    expect(locator.selectOption).toHaveBeenCalledWith("pro");
  });

  it("keypress presses the interpolated key", async () => {
    const { page, locator } = fakePage();
    await act(
      page,
      step({ action: "keypress", value: "Escape" }),
      "#field",
      {},
    );
    expect(locator.press).toHaveBeenCalledWith("Escape");
  });

  it("submit presses Enter regardless of step.value", async () => {
    const { page, locator } = fakePage();
    await act(page, step({ action: "submit", value: "ignored" }), "#form", {});
    expect(locator.press).toHaveBeenCalledWith("Enter");
  });
});

describe("act — file", () => {
  it("resolves the fixture path against fixturesDir and uploads it", async () => {
    const { page, locator } = fakePage();
    await act(
      page,
      step({ action: "file", value: "resume.pdf" }),
      "#resume-upload",
      {},
      "/repo/.gimbal/fixtures",
    );
    expect(locator.setInputFiles).toHaveBeenCalledWith(
      "/repo/.gimbal/fixtures/resume.pdf",
    );
  });

  it("throws when fixturesDir is not configured", async () => {
    const { page } = fakePage();
    await expect(
      act(page, step({ action: "file", value: "resume.pdf" }), "#upload", {}),
    ).rejects.toThrow(/fixturesDir/);
  });

  it("throws when the fixture path escapes fixturesDir", async () => {
    const { page } = fakePage();
    await expect(
      act(
        page,
        step({ action: "file", value: "../../etc/passwd" }),
        "#upload",
        {},
        "/repo/.gimbal/fixtures",
      ),
    ).rejects.toThrow(/outside fixturesDir/);
  });
});
