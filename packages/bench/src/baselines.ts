import { type Browser, chromium } from "playwright";
import type { Outcome } from "./stats.js";

// What a team has without Gimbal: the selector captured at authoring time, or a role+name locator.
// Both either click exactly one element or give up; neither guesses.
export async function runBaseline(
  browser: Browser,
  url: string,
  locate: (page: import("playwright").Page) => import("playwright").Locator,
): Promise<"acted" | "abstained"> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 8000 });
    const loc = locate(page);
    if ((await loc.count()) !== 1) return "abstained";
    await loc.click({ timeout: 2000 });
    await page.waitForTimeout(150); // let the fixture's hit beacon land
    return "acted";
  } catch {
    return "abstained";
  } finally {
    await page.close();
  }
}

export function classify(truth: string, hits: string[], id: string): Outcome {
  const acted = hits.length > 0;
  if (truth === "same")
    return hits.length === 1 && hits[0] === id
      ? "correct-repair"
      : acted
        ? "incorrect-repair"
        : "missed-repair";
  return acted ? "incorrect-repair" : "correct-abstention";
}

export const launch = () => chromium.launch({ headless: true });
