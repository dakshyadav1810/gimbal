import type { GimbalConfig } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import { openSession } from "./playwright.js";

function config(overrides: Partial<GimbalConfig> = {}): GimbalConfig {
  return {
    port: 4319,
    browser: "chromium",
    headless: true,
    dbPath: ":memory:",
    artifactsDir: "/tmp",
    fixturesDir: "/tmp/fixtures",
    screenshotsDir: "/tmp",
    embeddingModel: "x",
    embeddingRevision: "x",
    healing: { mode: "propose" },
    snapshotsDir: "snapshots",
    snapshots: "ground",
    bands: { high: 0.7, medium: 0.5 },
    timeouts: {
      actionMs: 5000,
      navMs: 10000,
      hydrationNetworkIdleMs: 2000,
      hydrationQuietWindowMs: 150,
    },
    db: { readOnly: true },
    maxScrollPasses: 3,
    determinism: {},
    ...overrides,
  } as GimbalConfig;
}

describe("openSession — determinism playbook wiring", () => {
  it("does not fix the clock when determinism.fixedTime is unset (default, behavior-neutral)", async () => {
    const session = await openSession(config());
    const before = Date.now();
    const pageNow = await session.page.evaluate(() => Date.now());
    // Real wall clock — just sanity-check it's in the right neighborhood, not frozen at zero/epoch.
    expect(pageNow).toBeGreaterThan(before - 5000);
    await session.close();
  }, 15000);

  it("freezes the page clock at determinism.fixedTime when set", async () => {
    const fixed = "2020-01-01T00:00:00.000Z";
    const session = await openSession(
      config({ determinism: { fixedTime: fixed } }),
    );
    const pageNow = await session.page.evaluate(() => Date.now());
    expect(pageNow).toBe(new Date(fixed).getTime());
    await session.close();
  }, 15000);
});
