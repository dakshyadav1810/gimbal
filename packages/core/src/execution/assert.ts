import type { Assertion, ExpectedOutcome, Tier1Target } from "@gimbal/shared";
import type { Page } from "playwright";

export interface AssertOutcome {
  ok: boolean;
  reason?: string;
}

// elementVisible/elementAbsent go straight to getByRole rather than through the resolver's
// cache/heal ladder (locate.ts) — assertion targets, unlike action-step targets, are never
// grounded to a durable selector. Role+label matching 2+ elements (repeated list rows, generic
// containers sharing a label) throws Playwright's strict-mode error; without this check that
// gets swallowed by .catch(() => false), which silently reports "absent" for elementAbsent when
// the element is actually present twice, and a false failure for elementVisible on an element
// that legitimately exists.
async function evaluateElementPresence(
  page: Page | undefined,
  target: Tier1Target,
  expectVisible: boolean,
): Promise<AssertOutcome> {
  if (!page) return ok(false);
  const locator = page.getByRole(target.role as any, { name: target.label });
  const count = await locator.count().catch(() => 0);
  if (count > 1) {
    return {
      ok: false,
      reason: `ambiguous target: role "${target.role}" name "${target.label}" matched ${count} elements`,
    };
  }
  if (count === 0) return ok(!expectVisible);
  const visible = await locator.isVisible().catch(() => false);
  return ok(visible === expectVisible);
}

function interpolate(s: string, vars: Record<string, string>): string {
  return s.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

// Unified UI/API/DB assertion evaluation (SPEC-003 §3). Locate failure is handled by the caller
// (locate.ts) and never reaches here — this only judges outcomes for elements/responses that were found.
export async function evaluateAssertion(
  a: Assertion,
  ctx: {
    page?: Page;
    apiResponse?: { status: number; body: unknown };
    dbRow?: unknown;
    vars: Record<string, string>;
  },
): Promise<AssertOutcome> {
  switch (a.type) {
    case "urlContains":
      return ok(
        ctx.page
          ? ctx.page.url().includes(interpolate(a.expected, ctx.vars))
          : false,
      );
    case "textContains": {
      const text = await ctx.page?.textContent("body");
      return ok(!!text?.includes(interpolate(a.expected, ctx.vars)));
    }
    case "value": {
      const locator = a.target
        ? ctx.page?.getByRole(a.target.role as any, { name: a.target.label })
        : ctx.page?.locator(":focus");
      const val = await locator?.inputValue().catch(() => "");
      return ok(val === interpolate(a.expected, ctx.vars));
    }
    case "elementVisible":
      return evaluateElementPresence(ctx.page, a.target, true);
    case "elementAbsent":
      return evaluateElementPresence(ctx.page, a.target, false);
    case "apiStatus":
      return ok(ctx.apiResponse?.status === a.expected);
    case "apiBody":
      return ok(deepEqual(getPath(ctx.apiResponse?.body, a.path), a.expected));
    case "dbRow":
      return ok(deepEqual(ctx.dbRow, a.expected));
  }
}

export async function evaluateExpectedOutcome(
  o: ExpectedOutcome,
  ctx: { page: Page; urlBefore: string; vars: Record<string, string> },
): Promise<AssertOutcome> {
  switch (o.type) {
    case "navigation":
    case "url_change":
      return ok(
        ctx.page.url() !== ctx.urlBefore &&
          (o.type === "navigation" || ctx.page.url().includes(o.value)),
      );
    case "element_appears":
      return evaluateElementPresence(ctx.page, o.target, true);
    case "text_contains": {
      const text = await ctx.page.textContent("body");
      return ok(!!text?.includes(interpolate(o.value, ctx.vars)));
    }
    case "field_contains": {
      const locator = o.target
        ? ctx.page.getByRole(o.target.role as any, { name: o.target.label })
        : ctx.page.locator(":focus");
      const val = await locator.inputValue().catch(() => "");
      return ok(val.includes(interpolate(o.value, ctx.vars)));
    }
  }
}

function ok(b: boolean): AssertOutcome {
  return b ? { ok: true } : { ok: false, reason: "assertion returned false" };
}
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce((o, k) => (o as any)?.[k], obj);
}

// JSON.stringify equality false-fails on key reordering (object key insertion order is not a
// meaningful part of API/DB response identity) — apiBody/dbRow need structural, not textual, equality.
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null)
    return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}
