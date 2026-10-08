import type { GimbalConfig, PageSnapshot } from "@gimbal/shared";
import {
  hydrationTimeoutsFrom,
  waitForPageHydration,
} from "../execution/hydration.js";
import { openSession } from "../execution/playwright.js";
import { snapshotPage } from "./index.js";

export async function refreshSnapshot(
  config: GimbalConfig,
  url: string,
): Promise<PageSnapshot> {
  const session = await openSession(config);
  try {
    await session.page.goto(url, { waitUntil: "domcontentloaded" });
    await waitForPageHydration(
      session.page,
      undefined,
      hydrationTimeoutsFrom(config),
    );
    return await snapshotPage(session.page, config, "refresh");
  } finally {
    await session.close();
  }
}
