import type { Assertion, ExpectedOutcome } from "@gimbal/shared";
import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { evaluateAssertion, evaluateExpectedOutcome } from "./assert.js";

interface FakePageOptions {
  url?: string;
  bodyText?: string;
  focusedValue?: string | Promise<never>;
  roleValue?: string | Promise<never>;
  roleVisible?: boolean;
  roleCount?: number;
  locatorVisible?: boolean;
}

function fakePage(opts: FakePageOptions = {}): Page {
  const {
    url = "https://app.test/",
    bodyText = "",
    focusedValue = "",
    roleValue = "",
    roleVisible = false,
    roleCount = 1,
    locatorVisible = false,
  } = opts;

  const focusedLocator = {
    inputValue: () =>
      focusedValue instanceof Promise ? focusedValue : Promise.resolve(focusedValue),
  };
  const roleLocator = {
    isVisible: () => Promise.resolve(roleVisible),
    inputValue: () =>
      roleValue instanceof Promise ? roleValue : Promise.resolve(roleValue),
    count: () => Promise.resolve(roleCount),
  };
  const plainLocator = { isVisible: () => Promise.resolve(locatorVisible) };

  return {
    url: () => url,
    textContent: () => Promise.resolve(bodyText),
    locator: (selector: string) =>
      selector === ":focus" ? focusedLocator : plainLocator,
    getByRole: () => roleLocator,
  } as unknown as Page;
}

describe("evaluateAssertion", () => {
  it("urlContains passes when the current URL includes the expected substring", async () => {
    const page = fakePage({ url: "https://app.test/dashboard?x=1" });
    const res = await evaluateAssertion(
      { type: "urlContains", expected: "/dashboard" },
      { page, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("urlContains fails when the substring is absent", async () => {
    const page = fakePage({ url: "https://app.test/sign-in" });
    const res = await evaluateAssertion(
      { type: "urlContains", expected: "/dashboard" },
      { page, vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("urlContains interpolates ${vars} into the expected value", async () => {
    const page = fakePage({ url: "https://app.test/tests/abc123" });
    const res = await evaluateAssertion(
      { type: "urlContains", expected: "/tests/${testId}" },
      { page, vars: { testId: "abc123" } },
    );
    expect(res.ok).toBe(true);
  });

  it("urlContains fails (does not throw) when no page is provided", async () => {
    const res = await evaluateAssertion(
      { type: "urlContains", expected: "/x" },
      { vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("textContains passes when the body text includes the expected substring", async () => {
    const page = fakePage({ bodyText: "Welcome back, Dana!" });
    const res = await evaluateAssertion(
      { type: "textContains", expected: "Welcome back" },
      { page, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("textContains fails when the substring is absent", async () => {
    const page = fakePage({ bodyText: "Nothing relevant here" });
    const res = await evaluateAssertion(
      { type: "textContains", expected: "Welcome back" },
      { page, vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("value passes when the focused element's value matches exactly", async () => {
    const page = fakePage({ focusedValue: "hello@example.com" });
    const res = await evaluateAssertion(
      { type: "value", expected: "hello@example.com" },
      { page, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("value interpolates vars and fails on mismatch", async () => {
    const page = fakePage({ focusedValue: "wrong" });
    const res = await evaluateAssertion(
      { type: "value", expected: "${email}" },
      { page, vars: { email: "hello@example.com" } },
    );
    expect(res.ok).toBe(false);
  });

  it("value swallows an inputValue() rejection and evaluates against an empty string", async () => {
    const page = fakePage({ focusedValue: Promise.reject(new Error("no focused element")) });
    const res = await evaluateAssertion(
      { type: "value", expected: "" },
      { page, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("value checks a specific target field via getByRole when target is given, ignoring focus", async () => {
    const page = fakePage({ focusedValue: "wrong-field-value", roleValue: "Buy milk" });
    const res = await evaluateAssertion(
      {
        type: "value",
        expected: "Buy milk",
        target: { label: "Title", semantics: [], role: "textbox", actions: [], intent: "note title" },
      },
      { page, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("value falls back to :focus when target is omitted (legacy behavior)", async () => {
    const page = fakePage({ focusedValue: "hello@example.com" });
    const res = await evaluateAssertion(
      { type: "value", expected: "hello@example.com" },
      { page, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("elementVisible passes when getByRole().isVisible() resolves true", async () => {
    const page = fakePage({ roleVisible: true });
    const res = await evaluateAssertion(
      {
        type: "elementVisible",
        target: { label: "Submit", semantics: [], role: "button", actions: [], intent: "submit" },
      },
      { page, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("elementAbsent passes when getByRole().isVisible() resolves false", async () => {
    const page = fakePage({ roleVisible: false });
    const res = await evaluateAssertion(
      {
        type: "elementAbsent",
        target: { label: "Error banner", semantics: [], role: "alert", actions: [], intent: "n/a" },
      },
      { page, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("elementVisible/elementAbsent swallow a locator error rather than throwing", async () => {
    const page = {
      getByRole: () => ({
        count: () => Promise.reject(new Error("detached")),
        isVisible: () => Promise.reject(new Error("detached")),
      }),
    } as unknown as Page;
    const visible = await evaluateAssertion(
      { type: "elementVisible", target: { label: "X", semantics: [], role: "button", actions: [], intent: "x" } },
      { page, vars: {} },
    );
    const absent = await evaluateAssertion(
      { type: "elementAbsent", target: { label: "X", semantics: [], role: "button", actions: [], intent: "x" } },
      { page, vars: {} },
    );
    expect(visible.ok).toBe(false); // count() rejects -> treated as 0 matches -> "visible" assertion fails
    expect(absent.ok).toBe(true); // ...and "absent" assertion passes for the same reason
  });

  it("elementAbsent fails with an explicit ambiguous-target reason (not a silent pass) when role+label matches 2+ elements", async () => {
    // Regression: previously went straight to getByRole().isVisible(), which throws Playwright's
    // strict-mode error on 2+ matches; .catch(() => false) swallowed that into "not visible" ->
    // elementAbsent silently reported "absent" even though the element exists twice.
    const page = fakePage({ roleCount: 2, roleVisible: true });
    const res = await evaluateAssertion(
      {
        type: "elementAbsent",
        target: { label: "Row", semantics: [], role: "row", actions: [], intent: "n/a" },
      },
      { page, vars: {} },
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/ambiguous target/);
  });

  it("elementVisible fails with an explicit ambiguous-target reason when role+label matches 2+ elements", async () => {
    const page = fakePage({ roleCount: 3, roleVisible: true });
    const res = await evaluateAssertion(
      {
        type: "elementVisible",
        target: { label: "Row", semantics: [], role: "row", actions: [], intent: "n/a" },
      },
      { page, vars: {} },
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/ambiguous target/);
  });

  it("elementAbsent passes when the locator matches zero elements", async () => {
    const page = fakePage({ roleCount: 0 });
    const res = await evaluateAssertion(
      {
        type: "elementAbsent",
        target: { label: "Missing", semantics: [], role: "alert", actions: [], intent: "n/a" },
      },
      { page, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("apiStatus passes when the response status matches exactly", async () => {
    const res = await evaluateAssertion(
      { type: "apiStatus", expected: 201 },
      { apiResponse: { status: 201, body: {} }, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("apiStatus fails on mismatch and when no response is present", async () => {
    const mismatch = await evaluateAssertion(
      { type: "apiStatus", expected: 200 },
      { apiResponse: { status: 404, body: {} }, vars: {} },
    );
    const missing = await evaluateAssertion(
      { type: "apiStatus", expected: 200 },
      { vars: {} },
    );
    expect(mismatch.ok).toBe(false);
    expect(missing.ok).toBe(false);
  });

  it("apiBody compares a dotted path against the expected value", async () => {
    const res = await evaluateAssertion(
      { type: "apiBody", path: "user.id", expected: 42 },
      { apiResponse: { status: 200, body: { user: { id: 42 } } }, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("apiBody fails when the path doesn't resolve to the expected value", async () => {
    const res = await evaluateAssertion(
      { type: "apiBody", path: "user.id", expected: 42 },
      { apiResponse: { status: 200, body: { user: { id: 7 } } }, vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("dbRow compares the whole row by deep JSON equality", async () => {
    const match = await evaluateAssertion(
      { type: "dbRow", query: "select 1", expected: { id: 1, name: "a" } },
      { dbRow: { id: 1, name: "a" }, vars: {} },
    );
    const mismatch = await evaluateAssertion(
      { type: "dbRow", query: "select 1", expected: { id: 1, name: "a" } },
      { dbRow: { id: 1, name: "b" }, vars: {} },
    );
    expect(match.ok).toBe(true);
    expect(mismatch.ok).toBe(false);
  });

  it("dbRow passes when keys are reordered (structural equality, not textual)", async () => {
    // Regression: JSON.stringify-based equality false-fails when a driver returns columns in a
    // different order than the expected literal was written in — key order isn't semantic here.
    const res = await evaluateAssertion(
      { type: "dbRow", query: "select 1", expected: { id: 1, name: "a" } },
      { dbRow: { name: "a", id: 1 }, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("dbRow fails when a nested key is reordered but values differ", async () => {
    const res = await evaluateAssertion(
      { type: "dbRow", query: "select 1", expected: { id: 1, meta: { a: 1, b: 2 } } },
      { dbRow: { id: 1, meta: { b: 2, a: 3 } }, vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("apiBody passes when the resolved object has reordered keys", async () => {
    const res = await evaluateAssertion(
      { type: "apiBody", path: "user", expected: { id: 42, name: "Dana" } },
      { apiResponse: { status: 200, body: { user: { name: "Dana", id: 42 } } }, vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("dbRow/apiBody fail when one side has an extra key the other lacks", async () => {
    const res = await evaluateAssertion(
      { type: "dbRow", query: "select 1", expected: { id: 1 } },
      { dbRow: { id: 1, extra: "x" }, vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("dbRow compares arrays element-wise regardless of object key order within elements", async () => {
    const res = await evaluateAssertion(
      { type: "dbRow", query: "select 1", expected: { tags: [{ id: 1, k: "a" }] } },
      { dbRow: { tags: [{ k: "a", id: 1 }] }, vars: {} },
    );
    expect(res.ok).toBe(true);
  });
});

describe("evaluateExpectedOutcome", () => {
  it("navigation passes when the URL changed at all, regardless of destination", async () => {
    const page = fakePage({ url: "https://app.test/dashboard" });
    const res = await evaluateExpectedOutcome(
      { type: "navigation" },
      { page, urlBefore: "https://app.test/sign-in", vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("navigation fails when the URL is unchanged", async () => {
    const page = fakePage({ url: "https://app.test/sign-in" });
    const res = await evaluateExpectedOutcome(
      { type: "navigation" },
      { page, urlBefore: "https://app.test/sign-in", vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("url_change requires both a changed URL and a matching substring", async () => {
    const page = fakePage({ url: "https://app.test/dashboard" });
    const matches = await evaluateExpectedOutcome(
      { type: "url_change", value: "/dashboard" },
      { page, urlBefore: "https://app.test/sign-in", vars: {} },
    );
    const wrongDestination = await evaluateExpectedOutcome(
      { type: "url_change", value: "/settings" },
      { page, urlBefore: "https://app.test/sign-in", vars: {} },
    );
    expect(matches.ok).toBe(true);
    expect(wrongDestination.ok).toBe(false);
  });

  it("url_change fails when the URL never changed, even if it already contained the target substring", async () => {
    const page = fakePage({ url: "https://app.test/dashboard" });
    const res = await evaluateExpectedOutcome(
      { type: "url_change", value: "/dashboard" },
      { page, urlBefore: "https://app.test/dashboard", vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("element_appears passes when the target's role+label resolves visible (DOM-blind, no raw selector)", async () => {
    const page = fakePage({ roleVisible: true });
    const res = await evaluateExpectedOutcome(
      {
        type: "element_appears",
        target: { label: "Saved", semantics: [], role: "status", actions: [], intent: "save confirmation" },
      },
      { page, urlBefore: "", vars: {} },
    );
    expect(res.ok).toBe(true);
  });

  it("element_appears swallows a locator error rather than throwing", async () => {
    const page = {
      getByRole: () => ({
        count: () => Promise.reject(new Error("bad selector")),
        isVisible: () => Promise.reject(new Error("bad selector")),
      }),
    } as unknown as Page;
    const res = await evaluateExpectedOutcome(
      {
        type: "element_appears",
        target: { label: "Saved", semantics: [], role: "status", actions: [], intent: "save confirmation" },
      },
      { page, urlBefore: "", vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("element_appears fails with an ambiguous-target reason when role+label matches 2+ elements", async () => {
    const page = fakePage({ roleCount: 2, roleVisible: true });
    const res = await evaluateExpectedOutcome(
      {
        type: "element_appears",
        target: { label: "Row", semantics: [], role: "row", actions: [], intent: "n/a" },
      },
      { page, urlBefore: "", vars: {} },
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/ambiguous target/);
  });

  it("text_contains interpolates vars against the page body", async () => {
    const page = fakePage({ bodyText: "Signed in as dana@example.com" });
    const res = await evaluateExpectedOutcome(
      { type: "text_contains", value: "Signed in as ${email}" },
      { page, urlBefore: "", vars: { email: "dana@example.com" } },
    );
    expect(res.ok).toBe(true);
  });

  it("field_contains interpolates vars against the focused element's value", async () => {
    const page = fakePage({ focusedValue: "dana@example.com" });
    const res = await evaluateExpectedOutcome(
      { type: "field_contains", value: "${email}" },
      { page, urlBefore: "", vars: { email: "dana@" } },
    );
    expect(res.ok).toBe(true);
  });

  it("field_contains fails when the focused value doesn't include the expected substring", async () => {
    const page = fakePage({ focusedValue: "nope" });
    const res = await evaluateExpectedOutcome(
      { type: "field_contains", value: "dana@" },
      { page, urlBefore: "", vars: {} },
    );
    expect(res.ok).toBe(false);
  });

  it("field_contains checks a specific target field via getByRole when target is given, ignoring focus", async () => {
    // Regression: after a submit, focus often moves off the field that was actually filled in
    // (e.g. onto the submit button, or is lost entirely) — field_contains must still be able to
    // check a specific field by role/label rather than only whatever currently has focus.
    const page = fakePage({ focusedValue: "unrelated", roleValue: "My Note Title" });
    const res = await evaluateExpectedOutcome(
      {
        type: "field_contains",
        value: "My Note Title",
        target: { label: "Title", semantics: [], role: "textbox", actions: [], intent: "note title" },
      },
      { page, urlBefore: "", vars: {} },
    );
    expect(res.ok).toBe(true);
  });
});
