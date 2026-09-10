import type { GimbalConfig } from "@gimbal/shared";
import type { Page } from "playwright";

export interface HydrationTimeouts {
  networkIdleMs: number;
  quietWindowMs: number;
}

const DEFAULT_HYDRATION_TIMEOUTS: HydrationTimeouts = {
  networkIdleMs: 2000,
  quietWindowMs: 150,
};

// Every waitForPageHydration call site should derive its override from config via this helper —
// until this session's fix, every real call site omitted the third argument entirely, silently
// discarding a project's `timeouts.hydrationNetworkIdleMs`/`hydrationQuietWindowMs` and always
// falling back to the hardcoded 2000ms/150ms regardless of what was configured.
export function hydrationTimeoutsFrom(config: GimbalConfig): HydrationTimeouts {
  return {
    networkIdleMs: config.timeouts.hydrationNetworkIdleMs,
    quietWindowMs: config.timeouts.hydrationQuietWindowMs,
  };
}

// Bounded networkidle + MutationObserver silence to ensure React SPAs have completed rendering
// and hydration before action dispatch or screenshot capture. `hydrationTimeouts` defaults to the
// original hardcoded 2000ms/150ms — pass config.timeouts.{hydrationNetworkIdleMs,
// hydrationQuietWindowMs} to override; omitting it is behavior-neutral.
export async function waitForPageHydration(
  page: Page,
  timeoutMs = 5000,
  hydrationTimeouts: HydrationTimeouts = DEFAULT_HYDRATION_TIMEOUTS,
): Promise<void> {
  if (typeof page?.waitForLoadState === "function") {
    await page
      .waitForLoadState("networkidle", {
        timeout: Math.min(timeoutMs, hydrationTimeouts.networkIdleMs),
      })
      .catch(() => {});
  }

  if (typeof page?.evaluate === "function") {
    await page
      .evaluate((quietMs) => {
        return new Promise<void>((resolve) => {
          let timer: ReturnType<typeof setTimeout>;
          const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
              observer.disconnect();
              resolve();
            }, quietMs);
          });
          observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });
          timer = setTimeout(() => {
            observer.disconnect();
            resolve();
          }, quietMs);
        });
      }, hydrationTimeouts.quietWindowMs)
      .catch(() => {});
  }
}
