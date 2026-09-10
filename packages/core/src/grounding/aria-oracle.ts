import type { Page } from "playwright";

// Verification/debugging oracle, NOT a resolver input — deliberately not a 6th weighted signal.
// Reuses Playwright's own ARIA-tree serialization (locator.ariaSnapshot()) rather than hand-rolling
// ARIA-tree diffing. Captured at grounding time and persisted as a sibling artifact so the dashboard
// (Phase 5) and an `ariaSnapshot` assertion (execution/assert.ts) can compare against it later.
export async function captureAriaSnapshot(page: Page): Promise<string> {
  return page.locator("body").ariaSnapshot();
}
