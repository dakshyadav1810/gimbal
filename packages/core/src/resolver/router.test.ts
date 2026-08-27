import { describe, expect, it } from "vitest";
import type { DomCandidate, PageContext } from "./base.js";
import {
  BASE_WEIGHTS,
  characterizePage,
  computeWeights,
  finalScore,
} from "./router.js";

function page(over: Partial<PageContext>): PageContext {
  return {
    textDensity: 0,
    iconRatio: 0,
    hasForm: false,
    hasModal: false,
    repeatedStructure: false,
    ...over,
  };
}

function cand(over: Partial<DomCandidate>): DomCandidate {
  return { id: "c", selector: "#c", tag: "div", ...over };
}

describe("computeWeights", () => {
  it("normalizes the base weights to sum to 1 with no page-context adjustment", () => {
    const w = computeWeights(page({}), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    expect(w.semantics + w.context + w.structure).toBeCloseTo(1, 10);
    // proportions unchanged from BASE_WEIGHTS since no adjustment fired
    expect(w.semantics / w.context).toBeCloseTo(
      BASE_WEIGHTS.semantics / BASE_WEIGHTS.context,
      6,
    );
  });

  it("boosts structure weight on icon-heavy pages", () => {
    const w = computeWeights(page({ iconRatio: 0.6 }), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    const baseline = computeWeights(page({ iconRatio: 0 }), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    expect(w.structure).toBeGreaterThan(baseline.structure);
  });

  it("does not boost structure at the iconRatio boundary (0.5, not > 0.5)", () => {
    const w = computeWeights(page({ iconRatio: 0.5 }), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    const baseline = computeWeights(page({}), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    expect(w.structure).toBeCloseTo(baseline.structure, 10);
  });

  it("boosts semantics weight on text-dense pages", () => {
    const w = computeWeights(page({ textDensity: 0.7 }), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    const baseline = computeWeights(page({}), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    expect(w.semantics).toBeGreaterThan(baseline.semantics);
  });

  it("boosts context weight when the page has a form", () => {
    const w = computeWeights(page({ hasForm: true }), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    const baseline = computeWeights(page({}), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    expect(w.context).toBeGreaterThan(baseline.context);
  });

  it("boosts context weight when the page has a modal", () => {
    const w = computeWeights(page({ hasModal: true }), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    const baseline = computeWeights(page({}), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    expect(w.context).toBeGreaterThan(baseline.context);
  });

  it("hasForm and hasModal share a single +0.1 context bonus, not two stacking bonuses", () => {
    // router.ts uses `if (hasForm || hasModal) w.context += 0.1` — one OR-gated bonus, so a page
    // with both flags true gets the same context boost as a page with only one.
    const both = computeWeights(page({ hasForm: true, hasModal: true }), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    const formOnly = computeWeights(page({ hasForm: true }), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    expect(both.context).toBeCloseTo(formOnly.context, 10);
  });

  it("boosts structure weight on a repeated-structure page (e.g. a list of near-identical rows)", () => {
    const w = computeWeights(page({ repeatedStructure: true }), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    const baseline = computeWeights(page({}), [
      { semantics: 0.5, context: 0.5, structure: 0.5 },
    ]);
    expect(w.structure).toBeGreaterThan(baseline.structure);
  });

  it("an icon-heavy page still lets semantics dominate context+structure combined when text is also dense", () => {
    const w = computeWeights(
      page({ iconRatio: 0.9, hasForm: true, hasModal: true, textDensity: 0.9 }),
      [{ semantics: 0.5, context: 0.5, structure: 0.5 }],
    );
    expect(w.semantics).toBeGreaterThan(w.context);
    expect(w.semantics).toBeGreaterThan(w.structure);
  });

  it("zeroes a signal's weight when every candidate scored 0 on it (zero-signal correction)", () => {
    const allScores = [
      { semantics: 0, context: 0.4, structure: 0.6 },
      { semantics: 0, context: 0.2, structure: 0.3 },
    ];
    const w = computeWeights(page({}), allScores);
    expect(w.semantics).toBe(0);
    expect(w.context + w.structure).toBeCloseTo(1, 10);
  });

  it("zeroes all weights and returns an all-zero result when every signal is universally zero", () => {
    const allScores = [{ semantics: 0, context: 0, structure: 0 }];
    const w = computeWeights(page({}), allScores);
    expect(w).toEqual({ semantics: 0, context: 0, structure: 0 });
  });

  it("does not zero a weight if only some candidates scored 0 on it", () => {
    const allScores = [
      { semantics: 0, context: 0.5, structure: 0.5 },
      { semantics: 0.8, context: 0.5, structure: 0.5 },
    ];
    const w = computeWeights(page({}), allScores);
    expect(w.semantics).toBeGreaterThan(0);
  });
});

describe("finalScore", () => {
  it("computes a weighted dot product of scores and weights", () => {
    const score = finalScore(
      { semantics: 1, context: 0, structure: 0 },
      { semantics: 0.5, context: 0.3, structure: 0.2 },
    );
    expect(score).toBeCloseTo(0.5, 10);
  });

  it("returns 0 when all scores are 0 regardless of weights", () => {
    const score = finalScore(
      { semantics: 0, context: 0, structure: 0 },
      { semantics: 0.5, context: 0.3, structure: 0.2 },
    );
    expect(score).toBe(0);
  });
});

describe("characterizePage", () => {
  it("computes textDensity as the fraction of candidates with a non-empty label", () => {
    const ctx = characterizePage([
      cand({ id: "a", label: "Submit" }),
      cand({ id: "b", label: "" }),
      cand({ id: "c" }),
      cand({ id: "d", label: "Cancel" }),
    ]);
    expect(ctx.textDensity).toBeCloseTo(0.5, 10);
    expect(ctx.iconRatio).toBeCloseTo(0.5, 10);
  });

  it("returns 0 density/ratio for an empty candidate list rather than NaN", () => {
    const ctx = characterizePage([]);
    expect(ctx.textDensity).toBe(0);
    expect(ctx.iconRatio).toBe(0);
  });

  it("detects a form region among candidates", () => {
    const ctx = characterizePage([cand({ id: "a", region: "form" })]);
    expect(ctx.hasForm).toBe(true);
    expect(ctx.hasModal).toBe(false);
  });

  it("detects a modal region among candidates", () => {
    const ctx = characterizePage([cand({ id: "a", region: "modal" })]);
    expect(ctx.hasModal).toBe(true);
  });

  it("flags repeatedStructure when tag diversity is low relative to candidate count", () => {
    const ctx = characterizePage([
      cand({ id: "a", tag: "li" }),
      cand({ id: "b", tag: "li" }),
      cand({ id: "c", tag: "li" }),
      cand({ id: "d", tag: "li" }),
    ]);
    expect(ctx.repeatedStructure).toBe(true);
  });

  it("does not flag repeatedStructure for a diverse-tag page", () => {
    const ctx = characterizePage([
      cand({ id: "a", tag: "button" }),
      cand({ id: "b", tag: "input" }),
      cand({ id: "c", tag: "a" }),
      cand({ id: "d", tag: "select" }),
    ]);
    expect(ctx.repeatedStructure).toBe(false);
  });
});
