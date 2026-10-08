import type {
  Band,
  CandidatesDoc,
  GimbalConfig,
  GroundedStep,
  GroundedTest,
  GroundedUiStep,
  Resolution,
  SpecIR,
} from "@gimbal/shared";
import type { Page } from "playwright";
import { act } from "../execution/act.js";
import {
  awaitNavigationIfExpected,
  waitForPendingUiToClear,
} from "../execution/adapters/ui.js";
import {
  hydrationTimeoutsFrom,
  waitForPageHydration,
} from "../execution/hydration.js";
import { openSession } from "../execution/playwright.js";
import { computeEffect } from "../execution/verify.js";
import type { DomCandidate } from "../resolver/base.js";
import type { Resolver } from "../resolver/index.js";
import { captureAriaSnapshot } from "./aria-oracle.js";
import { extractCandidatesWithScroll } from "./candidate.js";
import { computeDomHash } from "./dom-hash.js";
import { mergeResolution, toGroundedTest } from "./emitter.js";
import {
  accept,
  durableSelector,
  toWinnerOnly,
  withCachedSelector,
} from "./gate.js";
import { normalize } from "./normalize.js";

export interface GroundingOutcome {
  candidates: CandidatesDoc;
  grounded: GroundedTest;
  stoppedAt?: string;
  // Set when a scoped re-ground (opts.only) could not replay to the target state and re-resolved
  // every step instead.
  fellBackToFull?: string;
  // Verification/debugging oracle (Phase 4b) — the final page's ARIA tree, not a resolver input.
  ariaSnapshot: string;
}

export interface StepResolution {
  band: Band;
  cachedSelector: string | null;
  resolution: Resolution; // full ranked list — healing needs it for review records
  domHash: string;
}

export interface GroundingService {
  /**
   * With `only` + `previous`, steps outside `only` keep their previous grounding: they are replayed
   * with their stored selector to reach the right page state and only the listed steps go through
   * the resolver. Falls back to a full ground if the replay breaks.
   */
  ground(
    spec: SpecIR,
    opts: {
      vars?: Record<string, string>;
      only?: string[];
      previous?: GroundedTest;
    },
  ): Promise<GroundingOutcome>;
  reground(
    test: GroundedTest,
    stepId: string,
    page: Page,
  ): Promise<StepResolution>;
}

// True when the spec step is unchanged from the one a previous grounding was built from.
function sameAuthoring(step: SpecIR["steps"][number], prev: GroundedStep): boolean {
  if (step.kind !== "ui" || prev.kind !== "ui") return false;
  const { resolution: _r, ...prevTarget } = prev.target ?? ({} as never);
  const { effect: _e, target: _t, ...prevRest } = prev;
  const { target: _st, ...stepRest } = step;
  const canon = (v: unknown): string =>
    JSON.stringify(v, (_k, x) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
        : x,
    );
  return (
    canon(stepRest) === canon(prevRest) &&
    canon(step.target) === canon(prevTarget)
  );
}

function isNonTargetStep(step: SpecIR["steps"][number]): boolean {
  return (
    step.kind === "ui" && (step.action === "navigate" || step.action === "wait")
  );
}

const DEFAULT_WAIT_FOR_SELECTOR_TIMEOUT_MS = 10000;
const WAIT_FOR_SELECTOR_POLL_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { waitForPageHydration } from "../execution/hydration.js";

export class PlaywrightGroundingService implements GroundingService {
  constructor(
    private resolver: Resolver,
    private config: GimbalConfig,
  ) {}

  async ground(
    spec: SpecIR,
    opts: {
      vars?: Record<string, string>;
      only?: string[];
      previous?: GroundedTest;
    },
  ): Promise<GroundingOutcome> {
    const only = opts.only?.length && opts.previous ? new Set(opts.only) : null;
    const prevById = new Map(
      (only ? opts.previous?.steps : [])?.map((s) => [s.id, s]) ?? [],
    );
    const vars = { ...spec.flow.vars, ...(opts.vars ?? {}) };
    const hydrationTimeouts = hydrationTimeoutsFrom(this.config);
    const session = await openSession(this.config);
    const candidatesDoc: CandidatesDoc = {
      version: "1.0",
      specId: spec.flow.id,
      groundedAt: new Date().toISOString(),
      groundedUrl: spec.flow.startUrl,
      steps: [],
    };
    const groundedSteps: GroundedStep[] = [];
    let stoppedAt: string | undefined;
    let ariaSnapshot = "";

    try {
      await session.page.goto(spec.flow.startUrl, { waitUntil: "domcontentloaded" });
      await waitForPageHydration(session.page, undefined, hydrationTimeouts);

      for (const step of spec.steps) {
        if (step.kind !== "ui" || isNonTargetStep(step)) {
          if (step.kind === "ui") {
            try {
              await act(
                session.page,
                step,
                null,
                vars,
                undefined,
                hydrationTimeouts,
              );
            } catch {
              // A navigate that lands off the intended URL (e.g. an auth-guard redirect) would
              // otherwise silently ground every downstream step against the wrong page — stop
              // grounding here rather than let candidate extraction run against the wrong page.
              groundedSteps.push(step);
              stoppedAt = step.id;
              break;
            }
          }
          groundedSteps.push(step);
          continue;
        }
        if (!step.target) {
          groundedSteps.push(step);
          continue;
        }

        // Scoped re-ground: an untouched step keeps its grounding; replay it to reach the next state.
        const prev = only && !only.has(step.id) ? prevById.get(step.id) : undefined;
        if (
          prev?.kind === "ui" &&
          prev.target?.resolution?.cachedSelector &&
          sameAuthoring(step, prev)
        ) {
          try {
            const urlBefore = session.page.url();
            await act(
              session.page,
              step,
              prev.target.resolution.cachedSelector,
              vars,
              undefined,
              hydrationTimeouts,
            );
            await awaitNavigationIfExpected(step, session.page, urlBefore);
            await waitForPendingUiToClear(session.page);
            await waitForPageHydration(session.page, undefined, hydrationTimeouts);
            groundedSteps.push(prev);
            continue;
          } catch (e) {
            await session.close();
            const full = await this.ground(spec, { vars: opts.vars });
            return {
              ...full,
              fellBackToFull: `replaying ${step.id} with its stored selector failed: ${e}`,
            };
          }
        }

        // Grounding otherwise has NO retry loop — one extraction, one resolve, and it either
        // accepts or gives up. That's fine for most steps (the page just acted on something and
        // should already be settled), but it means a step landing right after variable-latency
        // async rendering (a React.lazy()/Suspense boundary, a slow API-backed dropdown) can lose
        // a race against content that hasn't rendered yet, with no second chance. `waitForSelector`
        // exists specifically to give grounding that second (and third, and fourth...) chance by
        // polling until its own timeout, instead of asking every OTHER step to absorb that risk.
        const isWaitForSelector =
          step.kind === "ui" && step.action === "waitForSelector";
        const waitBudgetMs = isWaitForSelector
          ? Number(step.value) || DEFAULT_WAIT_FOR_SELECTOR_TIMEOUT_MS
          : 0;
        const deadline = Date.now() + waitBudgetMs;

        let resolution: Resolution;
        let beforeCands: DomCandidate[] = [];
        for (;;) {
          const domCandidates = await extractCandidatesWithScroll(
            session.page,
            this.config.maxScrollPasses,
          );
          const input = normalize(
            step.target,
            domCandidates,
            step.generalization,
          );
          beforeCands = domCandidates;
          resolution = await this.resolver.resolve(input);
          if (accept(resolution.band) && resolution.selected) break;
          if (!isWaitForSelector || Date.now() >= deadline) break;
          await sleep(WAIT_FOR_SELECTOR_POLL_MS);
        }
        candidatesDoc.steps.push({ stepId: step.id, resolution });

        if (accept(resolution.band) && resolution.selected) {
          const grounded = withCachedSelector(resolution);
          groundedSteps.push(mergeResolution(step, grounded));
          if (isWaitForSelector) {
            // Nothing to act on — the step's whole job was confirming the target resolved.
            await waitForPendingUiToClear(session.page);
            await waitForPageHydration(session.page, undefined, hydrationTimeouts);
          } else {
            const urlBefore = session.page.url();
            await act(
              session.page,
              step,
              grounded.cachedSelector,
              vars,
              undefined,
              hydrationTimeouts,
            ); // ACT-to-advance
            // Same server-action-redirect race as execution's UiAdapter: a submit/click can
            // trigger a navigation that hasn't landed by the time act() resolves, so the next
            // step's candidate extraction would otherwise run against the pre-redirect DOM.
            await awaitNavigationIfExpected(step, session.page, urlBefore);
            await waitForPendingUiToClear(session.page);
            await waitForPageHydration(session.page, undefined, hydrationTimeouts);
            // Remember what acting did, so a later runtime heal can be sanity-checked against it.
            const afterCands = await extractCandidatesWithScroll(
              session.page,
              this.config.maxScrollPasses,
            );
            const last = groundedSteps.length - 1;
            groundedSteps[last] = {
              ...(groundedSteps[last] as GroundedUiStep),
              effect: computeEffect(
                beforeCands,
                afterCands,
                urlBefore,
                session.page.url(),
                beforeCands.find((c) => c.id === resolution.selected)?.label,
              ),
            };
          }
        } else {
          groundedSteps.push(mergeResolution(step, toWinnerOnly(resolution)));
          stoppedAt = step.id;
          break;
        }
      }
      // Best-effort — captured while the session is still open; a failure here shouldn't fail
      // grounding itself since this is a verification oracle, not a resolver input.
      ariaSnapshot = await captureAriaSnapshot(session.page).catch(() => "");
    } finally {
      await session.close();
    }

    return {
      candidates: candidatesDoc,
      grounded: toGroundedTest(spec, groundedSteps, spec.flow.startUrl, {
        model: this.config.embeddingModel,
        revision: this.config.embeddingRevision,
      }),
      stoppedAt,
      ariaSnapshot,
    };
  }

  // Single-step re-ground for runtime heal (LLD-006). Reuses the caller's live page — no new browser.
  async reground(
    test: GroundedTest,
    stepId: string,
    page: Page,
  ): Promise<StepResolution> {
    const step = test.steps.find((s) => s.id === stepId);
    if (!step || step.kind !== "ui" || !step.target) {
      throw new Error(`step ${stepId} is not a groundable UI step`);
    }
    const domCandidates = await extractCandidatesWithScroll(
      page,
      this.config.maxScrollPasses,
    );
    const domHash = computeDomHash(domCandidates);
    const input = normalize(step.target, domCandidates, step.generalization);
    const resolution = await this.resolver.resolve(input);
    const winner = resolution.candidates.find(
      (c) => c.id === resolution.selected,
    );
    const cachedSelector =
      accept(resolution.band) && winner ? durableSelector(winner) : null;
    return { band: resolution.band, cachedSelector, resolution, domHash };
  }
}
