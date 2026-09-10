import type { GimbalConfig } from "@gimbal/shared";
import {
  type Browser,
  type BrowserContext,
  type Page,
  chromium,
  firefox,
  webkit,
} from "playwright";

const ENGINES = { chromium, firefox, webkit };

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

// Shared browser/page lifecycle wrapper — used by grounding (LLD-003) and execution (LLD-005),
// but never sharing live state across their boundary (LLD-005 §8).
export async function openSession(
  config: GimbalConfig,
): Promise<BrowserSession> {
  const browser = await ENGINES[config.browser].launch({
    headless: config.headless,
  });
  const { fixedTime, harPath, harMode, storageStatePath } =
    config.determinism;
  const context = await browser.newContext(
    storageStatePath ? { storageState: storageStatePath } : {},
  );
  if (harPath) {
    // update: true (record) captures live traffic into the file; update: false (replay) serves
    // requests from it instead of hitting the network — never the implicit default (see schema).
    await context.routeFromHAR(harPath, { update: harMode === "record" });
  }
  const page = await context.newPage();
  if (fixedTime) {
    await page.clock.setFixedTime(new Date(fixedTime));
  }
  page.setDefaultTimeout(config.timeouts.actionMs);
  page.setDefaultNavigationTimeout(config.timeouts.navMs);
  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}
