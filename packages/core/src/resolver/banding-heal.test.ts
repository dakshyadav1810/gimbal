import { describe, expect, it } from "vitest";
import { healAmbiguity } from "./banding.js";

const c = (id: string, score: number, semantics: number) => ({
  id,
  label: id,
  score,
  signals: { semantics },
});

describe("healAmbiguity", () => {
  it("accepts a clear score lead", () => {
    expect(healAmbiguity([c("a", 0.9, 0.8), c("b", 0.7, 0.8)], "a")).toBeNull();
  });
  it("rejects a near tie with similar labels", () => {
    expect(
      healAmbiguity([c("a", 0.75, 0.81), c("b", 0.74, 0.81)], "a"),
    ).toMatch(/within 0.01/);
  });
  it("rejects when the chosen candidate is outscored (tiebreak pick)", () => {
    expect(healAmbiguity([c("a", 0.7, 0.9), c("b", 0.75, 0.9)], "a")).toMatch(
      /outscores/,
    );
  });
  it("accepts a close score when the label match is clearly better", () => {
    expect(healAmbiguity([c("a", 0.8, 1), c("b", 0.8, 0.75)], "a")).toBeNull();
  });
  it("accepts a lone candidate", () => {
    expect(healAmbiguity([c("a", 0.8, 1)], "a")).toBeNull();
  });
});
