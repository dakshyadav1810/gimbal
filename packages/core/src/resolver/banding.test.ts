import { describe, expect, it } from "vitest";
import type { Scored } from "./banding.js";
import { selectBest, toBand } from "./banding.js";
import type { DomCandidate } from "./base.js";

const bands = { high: 0.7, medium: 0.5 };

function cand(over: Partial<DomCandidate>): DomCandidate {
  return { id: "c", selector: "#c", tag: "div", ...over };
}

function scored(over: Partial<DomCandidate>, score: number): Scored {
  return { candidate: cand(over), score };
}

describe("toBand", () => {
  it("classifies at and above the high boundary as high", () => {
    expect(toBand(0.7, bands)).toBe("high");
    expect(toBand(1, bands)).toBe("high");
  });
  it("classifies at the medium boundary and above (below high) as medium", () => {
    expect(toBand(0.5, bands)).toBe("medium");
    expect(toBand(0.69, bands)).toBe("medium");
  });
  it("classifies below medium as low", () => {
    expect(toBand(0.49, bands)).toBe("low");
    expect(toBand(0, bands)).toBe("low");
  });
});

describe("selectBest — empty input", () => {
  it("returns null winner, low band, not ambiguous for zero candidates", () => {
    const res = selectBest([], "same_element", bands);
    expect(res).toEqual({ winner: null, band: "low", ambiguous: false });
  });
});

describe("selectBest — same_element (full margin 0.15)", () => {
  it("picks the clear winner when the gap exceeds the margin", () => {
    const a = scored({ id: "a" }, 0.9);
    const b = scored({ id: "b" }, 0.5);
    const res = selectBest([a, b], "same_element", bands);
    expect(res.winner?.candidate.id).toBe("a");
    expect(res.ambiguous).toBe(false);
    expect(res.band).toBe("high");
  });

  it("treats a gap exactly at the margin boundary as decisive, not ambiguous", () => {
    // top - runnerUp === margin (0.15) → `< margin` is false → no ambiguity path
    const a = scored({ id: "a" }, 0.8);
    const b = scored({ id: "b" }, 0.65);
    const res = selectBest([a, b], "same_element", bands);
    expect(res.ambiguous).toBe(false);
    expect(res.winner?.candidate.id).toBe("a");
  });

  it("downgrades high to medium when top and runner-up are within the margin and untiebreakable", () => {
    const a = scored({ id: "a" }, 0.85);
    const b = scored({ id: "b" }, 0.8); // gap 0.05 < 0.15 margin, neither has testId/siblingIndex
    const res = selectBest([a, b], "same_element", bands);
    expect(res.ambiguous).toBe(true);
    expect(res.band).toBe("medium"); // was "high" (0.85), downgraded one tier
    // selectBest still reports the top scorer as `winner` even when ambiguous — it's the
    // resolver (index.ts) that treats `ambiguous: true` as "don't actually select anything".
    expect(res.winner?.candidate.id).toBe("a");
  });

  it("downgrades medium to low when tied scores fall in the medium band", () => {
    const a = scored({ id: "a" }, 0.55);
    const b = scored({ id: "b" }, 0.52);
    const res = selectBest([a, b], "same_element", bands);
    expect(res.ambiguous).toBe(true);
    expect(res.band).toBe("low");
  });

  it("resolves a near-tie via testId tiebreak instead of downgrading", () => {
    const a = scored({ id: "a", testId: "email-input" }, 0.85);
    const b = scored({ id: "b" }, 0.8);
    const res = selectBest([a, b], "same_element", bands);
    expect(res.ambiguous).toBe(false);
    expect(res.winner?.candidate.id).toBe("a");
    expect(res.band).toBe("high");
  });

  it("falls through to sibling-index tiebreak when neither near-tied candidate has a testId", () => {
    const a = scored({ id: "a", siblingIndex: 3 }, 0.85);
    const b = scored({ id: "b", siblingIndex: 1 }, 0.8);
    const res = selectBest([a, b], "same_element", bands);
    expect(res.ambiguous).toBe(false);
    expect(res.winner?.candidate.id).toBe("b"); // lower siblingIndex wins
  });

  it("prefers testId tiebreak over siblingIndex when both are present among tied candidates", () => {
    const a = scored({ id: "a", siblingIndex: 0 }, 0.85);
    const b = scored({ id: "b", testId: "x", siblingIndex: 5 }, 0.8);
    const res = selectBest([a, b], "same_element", bands);
    expect(res.winner?.candidate.id).toBe("b");
  });

  it("only includes candidates within the margin of the top score in the tiebreak pool", () => {
    // c is far below the margin and has a testId — must NOT be pulled in as the tiebreak winner
    const a = scored({ id: "a" }, 0.85);
    const b = scored({ id: "b" }, 0.8);
    const c = scored({ id: "c", testId: "decoy" }, 0.3);
    const res = selectBest([a, b, c], "same_element", bands);
    expect(res.winner?.candidate.id).not.toBe("c");
  });

  it("is decisive with a single candidate regardless of score", () => {
    const a = scored({ id: "a" }, 0.2);
    const res = selectBest([a], "same_element", bands);
    expect(res.winner?.candidate.id).toBe("a");
    expect(res.ambiguous).toBe(false);
    expect(res.band).toBe("low");
  });
});

describe("selectBest — any_matching (half margin 0.075)", () => {
  it("uses half the margin, so a gap that would be ambiguous under same_element is decisive here", () => {
    // gap 0.1: < 0.15 (same_element margin, would ambiguous) but > 0.075 (any_matching margin)
    const a = scored({ id: "a" }, 0.85);
    const b = scored({ id: "b" }, 0.75);
    const res = selectBest([a, b], "any_matching", bands);
    expect(res.ambiguous).toBe(false);
    expect(res.winner?.candidate.id).toBe("a");
  });

  it("still downgrades when the gap is within the halved margin", () => {
    const a = scored({ id: "a" }, 0.85);
    const b = scored({ id: "b" }, 0.83); // gap 0.02 < 0.075
    const res = selectBest([a, b], "any_matching", bands);
    expect(res.ambiguous).toBe(true);
  });
});

describe("selectBest — aggressive/flexible (no margin requirement)", () => {
  it("picks the top scorer outright under aggressive, even with a near-tied runner-up", () => {
    const a = scored({ id: "a" }, 0.85);
    const b = scored({ id: "b" }, 0.84);
    const res = selectBest([a, b], "aggressive", bands);
    expect(res.ambiguous).toBe(false);
    expect(res.winner?.candidate.id).toBe("a");
    expect(res.band).toBe("high");
  });

  it("picks the top scorer outright under flexible, even with a near-tied runner-up", () => {
    const a = scored({ id: "a" }, 0.72);
    const b = scored({ id: "b" }, 0.71);
    const res = selectBest([a, b], "flexible", bands);
    expect(res.ambiguous).toBe(false);
    expect(res.winner?.candidate.id).toBe("a");
  });

  it("never downgrades band under aggressive even for identical scores", () => {
    const a = scored({ id: "a" }, 0.8);
    const b = scored({ id: "b" }, 0.8);
    const res = selectBest([a, b], "aggressive", bands);
    expect(res.ambiguous).toBe(false);
    expect(res.band).toBe("high");
  });
});
