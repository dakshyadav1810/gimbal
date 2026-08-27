import fs from "node:fs/promises";
import path from "node:path";
import type { StepResult, UiStep } from "@gimbal/shared";
import pino from "pino";
import type { Page } from "playwright";
import { act } from "../act.js";
import { evaluateAssertion, evaluateExpectedOutcome } from "../assert.js";
import { locate } from "../locate.js";
import {
  type RunContext,
  type StepAdapter,
  checkPrecondition,
} from "../types.js";

const logger = pino({ name: "ui-adapter" });

// A submit/click can trigger a server-action redirect that hasn't landed by the time the
// Playwright action call resolves (click() only waits for the event to dispatch, not for any
// resulting navigation). Only steps that actually expect a URL change should pay this wait —
// waiting unconditionally would stall every non-navigating click for the full nav timeout.
export function expectsNavigation(step: UiStep): boolean {
  return (
    step.expectedOutcome.some(
      (o) => o.type === "navigation" || o.type === "url_change",
    ) || step.assertions.some((a) => a.type === "urlContains")
  );
}

export async function awaitNavigationIfExpected(
  step: UiStep,
  page: Page,
  urlBefore: string,
): Promise<void> {
  if (!expectsNavigation(step)) return;
  await page
    .waitForURL((url) => url.toString() !== urlBefore, {
      waitUntil: "load",
    })
    .catch(() => {});
}

// A submit/click that triggers a server action (no navigation) can still be mid-flight when
// act() resolves — the button may show a loading spinner via aria-busy or a disabled state
// while the async work (and the success UI an assertion is checking for) hasn't landed yet.
// Bounded short wait: this must never stall a step that has no such indicator at all.
const PENDING_UI_SELECTOR =
  '[aria-busy="true"], button[disabled], [data-loading="true"]';
const PENDING_UI_TIMEOUT_MS = 3000;

export async function waitForPendingUiToClear(page: Page): Promise<void> {
  await page
    .locator(PENDING_UI_SELECTOR)
    .first()
    .waitFor({ state: "detached", timeout: PENDING_UI_TIMEOUT_MS })
    .catch(() => {});
}

// Capture failure must never fail the step — observability, not correctness (LLD-010 §2.4).
async function captureScreenshot(
  ctx: RunContext,
  stepId: string,
): Promise<string | undefined> {
  try {
    const dir = path.join(ctx.screenshotsDir, ctx.runId);
    await fs.mkdir(dir, { recursive: true });
    const relPath = path.join(ctx.runId, `${stepId}.jpg`);
    await ctx.page.screenshot({
      path: path.join(ctx.screenshotsDir, relPath),
      type: "jpeg",
      quality: 70,
    });
    return relPath;
  } catch (e) {
    logger.warn({ err: e, stepId }, "screenshot capture failed");
    return undefined;
  }
}

export class UiAdapter implements StepAdapter {
  readonly kind = "ui" as const;

  async execute(step: UiStep, ctx: RunContext): Promise<StepResult> {
    const start = Date.now();
    if (!(await checkPrecondition(step, ctx.page))) {
      return fail(step.id, "STATE_BLOCKED", "precondition not met", start);
    }

    const isTarget = step.action !== "navigate" && step.action !== "wait";
    let selection: StepResult["selection"] = undefined;
    let band: StepResult["band"] = undefined;
    let resolvedSelector: string | null = null;

    if (isTarget) {
      const groundedStep = ctx.test.steps.find((s) => s.id === step.id);
      if (groundedStep?.kind !== "ui")
        return fail(
          step.id,
          "NOT_GROUNDED",
          "step is not a grounded ui step",
          start,
        );
      const result = await locate(
        ctx.test,
        groundedStep,
        ctx.page,
        ctx.cache,
        ctx.healing,
        ctx.testId,
      );
      selection = result.source;
      if (!result.locator) {
        return {
          stepId: step.id,
          status: "stale",
          selection: "none",
          screenshot: await captureScreenshot(ctx, step.id),
          durationMs: Date.now() - start,
        };
      }
      band = groundedStep.target?.resolution?.band;
      resolvedSelector = result.selector;
    }

    const urlBefore = ctx.page.url();
    try {
      await act(ctx.page, step, resolvedSelector, ctx.vars);
    } catch (e) {
      return maybeInvert(
        step,
        {
          ...fail(step.id, "ACTION_FAILED", String(e), start),
          screenshot: await captureScreenshot(ctx, step.id),
        },
        selection,
        band,
      );
    }
    await awaitNavigationIfExpected(step, ctx.page, urlBefore);
    await waitForPendingUiToClear(ctx.page);

    let outcomeFailure: StepResult | undefined;
    for (const outcome of step.expectedOutcome) {
      const res = await evaluateExpectedOutcome(outcome, {
        page: ctx.page,
        urlBefore,
        vars: ctx.vars,
      });
      if (!res.ok) {
        outcomeFailure = fail(
          step.id,
          "EXPECTED_OUTCOME_FAILED",
          res.reason ?? "",
          start,
          selection,
          band,
        );
        break;
      }
    }
    if (!outcomeFailure) {
      for (const a of step.assertions) {
        const res = await evaluateAssertion(a, {
          page: ctx.page,
          vars: ctx.vars,
        });
        if (!res.ok) {
          outcomeFailure = fail(
            step.id,
            "ASSERTION_FAILED",
            res.reason ?? "",
            start,
            selection,
            band,
          );
          break;
        }
      }
    }

    const screenshot = await captureScreenshot(ctx, step.id);
    if (outcomeFailure)
      return maybeInvert(
        step,
        { ...outcomeFailure, screenshot },
        selection,
        band,
      );

    const passed: StepResult = {
      stepId: step.id,
      status: "passed",
      selection,
      band,
      screenshot,
      durationMs: Date.now() - start,
    };
    return maybeInvert(step, passed, selection, band);
  }
}

function fail(
  stepId: string,
  reason: string,
  message: string,
  start: number,
  selection?: StepResult["selection"],
  band?: StepResult["band"],
): StepResult {
  return {
    stepId,
    status: "failed",
    selection,
    band,
    failure: { reason, message },
    durationMs: Date.now() - start,
  };
}

// SPEC-003 §6: negative tests invert passed/failed — a correct app rejection passes, wrong acceptance fails.
function maybeInvert(
  step: UiStep,
  result: StepResult,
  selection?: StepResult["selection"],
  band?: StepResult["band"],
): StepResult {
  if (!step.negative) return result;
  if (result.status === "passed")
    return {
      ...result,
      status: "failed",
      failure: {
        reason: "NEGATIVE_TEST",
        message: "app accepted input it should have rejected",
      },
    };
  if (result.status === "failed")
    return {
      stepId: step.id,
      status: "passed",
      selection,
      band,
      screenshot: result.screenshot,
      durationMs: result.durationMs,
    };
  return result;
}
