import type { UiStep } from "@gimbal/shared";
import type { Locator, Page } from "playwright";

function interpolate(
  value: string | undefined,
  vars: Record<string, string>,
): string {
  if (!value) return "";
  return value.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

async function isAlreadyOpen(locator: Locator): Promise<boolean> {
  const [ariaExpanded, dataState] = await Promise.all([
    locator.getAttribute("aria-expanded").catch(() => null),
    locator.getAttribute("data-state").catch(() => null),
  ]);
  return ariaExpanded === "true" || dataState === "open";
}

// goto() resolves once the response commits, even when a server-side redirect (e.g. an auth guard)
// bounces the page somewhere else entirely — Playwright never surfaces that as an error. Compare
// origin+pathname (not full URL) so query/hash differences added by the app don't false-positive.
function landedOnIntendedUrl(targetUrl: string, actualUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const actual = new URL(actualUrl);
    return target.origin === actual.origin && target.pathname === actual.pathname;
  } catch {
    return true; // relative/unparseable value — nothing meaningful to compare
  }
}

// Dispatches the Playwright action for a UI step against a resolved selector (or none, for navigate/wait).
export async function act(
  page: Page,
  step: UiStep,
  selector: string | null,
  vars: Record<string, string>,
): Promise<void> {
  const value = interpolate(step.value, vars);
  switch (step.action) {
    case "navigate": {
      const target = interpolate(step.value, vars) || page.url();
      await page.goto(target);
      if (!landedOnIntendedUrl(target, page.url())) {
        throw new Error(
          `navigate landed on ${page.url()} instead of intended ${target} (likely a server-side redirect)`,
        );
      }
      return;
    }
    case "wait":
      await page.waitForTimeout(Number(value) || 500);
      return;
  }
  if (!selector)
    throw new Error(`action ${step.action} requires a resolved selector`);
  const locator = page.locator(selector).first();
  switch (step.action) {
    case "click":
      // A toggle/menu trigger that's already open (Radix and similar libraries mark this via
      // aria-expanded="true" / data-state="open") doesn't need re-clicking — the desired state is
      // already achieved. Re-clicking a currently-open Radix trigger routes through its
      // DismissableLayer's outside-click handling, which Playwright's actionability wait reads as
      // something intercepting pointer events, and it spins for the full action timeout.
      if (await isAlreadyOpen(locator)) return;
      await locator.click();
      return;
    case "type":
      await locator.fill(value);
      return;
    case "select":
      await locator.selectOption(value);
      return;
    case "keypress":
      await locator.press(value);
      return;
    case "submit":
      await locator.press("Enter");
      return;
  }
}
