import fs from "node:fs/promises";
import path from "node:path";
import type { StepResult, UiStep } from "@gimbal/shared";
import pino from "pino";
import { act } from "../act.js";
import { evaluateAssertion, evaluateExpectedOutcome } from "../assert.js";
import { locate } from "../locate.js";
import {
  type RunContext,
  type StepAdapter,
  checkPrecondition,
} from "../types.js";

const logger = pino({ name: "ui-adapter" });

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
      );
      selection = result.source;
      if (!result.locator) {
        return {
          stepId: step.id,
          status: "stale",
          selection: "none",
          durationMs: Date.now() - start,
        };
      }
      band = groundedStep.target?.resolution?.band;
    }

    const urlBefore = ctx.page.url();
    try {
      const groundedStep = ctx.test.steps.find((s) => s.id === step.id);
      const cachedSelector =
        groundedStep?.kind === "ui"
          ? (groundedStep.target?.resolution?.cachedSelector ?? null)
          : null;
      await act(ctx.page, step, isTarget ? cachedSelector : null, ctx.vars);
    } catch (e) {
      return maybeInvert(
        step,
        fail(step.id, "ACTION_FAILED", String(e), start),
        selection,
        band,
      );
    }

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
