import type {
  ActionType,
  GimbalConfig,
  Tier1Target,
  UiStep,
} from "@gimbal/shared";
import { act } from "../execution/act.js";
import {
  awaitNavigationIfExpected,
  waitForPendingUiToClear,
} from "../execution/adapters/ui.js";
import { openSession } from "../execution/playwright.js";
import { extractCandidates } from "../grounding/candidate.js";
import { durableSelector } from "../grounding/gate.js";
import { hydrationTimeoutsFrom } from "../execution/hydration.js";
import { waitForPageHydration } from "../grounding/index.js";
import { normalize } from "../grounding/normalize.js";
import type { DomCandidate } from "../resolver/base.js";
import type { Resolver } from "../resolver/index.js";

export type DomDiff = string[];

export interface ExploreUiRequest {
  url: string;
  action: ActionType;
  target?: Tier1Target;
  value?: string;
}

export interface ExploreUiResponse {
  domDiff: DomDiff;
  urlChangedTo?: string;
  screenshot?: string;
}

function candidateKey(c: DomCandidate): string {
  if (c.testId) return `testid:${c.testId}`;
  if (c.xpath) return `xpath:${c.xpath}`;
  return `${c.tag}:${c.role ?? ""}:${c.label ?? ""}:${c.selector}`;
}

function candidateDescriptor(c: DomCandidate): string {
  const kind =
    c.role === "dialog" || c.region === "modal" ? "modal" : c.role ?? c.tag;
  const name = c.label
    ? `'${c.label}'`
    : c.testId
      ? `[data-testid='${c.testId}']`
      : c.selector;
  return `${kind} ${name}`;
}

export function computeDomDiff(
  before: DomCandidate[],
  after: DomCandidate[],
): DomDiff {
  const beforeKeys = new Map<string, DomCandidate>();
  for (const c of before) {
    beforeKeys.set(candidateKey(c), c);
  }

  const afterKeys = new Map<string, DomCandidate>();
  for (const c of after) {
    afterKeys.set(candidateKey(c), c);
  }

  const diff: string[] = [];

  // Identify Added Elements (+ modal 'Settings', + button 'Save')
  for (const [key, cand] of afterKeys.entries()) {
    if (!beforeKeys.has(key)) {
      diff.push(`+ ${candidateDescriptor(cand)}`);
    }
  }

  // Identify Removed Elements (- button 'Open Settings')
  for (const [key, cand] of beforeKeys.entries()) {
    if (!afterKeys.has(key)) {
      diff.push(`- ${candidateDescriptor(cand)}`);
    }
  }

  return diff;
}

export async function exploreUiState(
  config: GimbalConfig,
  resolver: Resolver,
  req: ExploreUiRequest,
): Promise<ExploreUiResponse> {
  const session = await openSession(config);
  const hydrationTimeouts = hydrationTimeoutsFrom(config);
  try {
    await session.page.goto(req.url);
    await waitForPageHydration(session.page, undefined, hydrationTimeouts);

    const before = await extractCandidates(session.page);

    if (req.target) {
      const input = normalize(req.target, before, "same_element");
      const resolution = await resolver.resolve(input);
      const winner = resolution.candidates.find(
        (c) => c.id === resolution.selected,
      );
      const selector = winner ? durableSelector(winner) : null;
      const step: UiStep = {
        id: "explore-action",
        kind: "ui",
        action: req.action,
        intent: req.target.intent || "explore action",
        value: req.value,
        target: req.target,
        onFailure: "abort",
        preconditions: [],
        assertions: [],
        negative: false,
        generalization: "same_element",
        expectedOutcome: [],
      };
      const urlBefore = session.page.url();
      await act(session.page, step, selector, {}, undefined, hydrationTimeouts);
      await awaitNavigationIfExpected(step, session.page, urlBefore);
      await waitForPendingUiToClear(session.page);
      await waitForPageHydration(session.page, undefined, hydrationTimeouts);
    }

    const after = await extractCandidates(session.page);
    const domDiff = computeDomDiff(before, after);
    const currentUrl = session.page.url();
    const urlChangedTo = currentUrl !== req.url ? currentUrl : undefined;

    let screenshot: string | undefined;
    try {
      const buf = await session.page.screenshot();
      screenshot = buf.toString("base64");
    } catch {
      // screenshot capture failure is non-fatal
    }

    return {
      domDiff,
      urlChangedTo,
      screenshot,
    };
  } finally {
    await session.close();
  }
}
