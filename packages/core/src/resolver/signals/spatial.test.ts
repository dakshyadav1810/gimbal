import { describe, expect, it } from "vitest";
import type { DomCandidate } from "../base.js";
import { spatialLabelScore } from "./spatial.js";

function target(label: string) {
  return {
    label,
    semantics: [label],
    role: "textbox" as const,
    actions: [],
    intent: label,
  };
}

function cand(overrides: Partial<DomCandidate> = {}): DomCandidate {
  return {
    id: "c1",
    selector: "#x",
    tag: "input",
    ...overrides,
  };
}

describe("spatialLabelScore", () => {
  it("returns 0 when spatialLabel is absent", () => {
    expect(spatialLabelScore(target("Email"), cand())).toBe(0);
  });

  it("returns 0 when spatialLabel is undefined", () => {
    expect(
      spatialLabelScore(target("Email"), cand({ spatialLabel: undefined })),
    ).toBe(0);
  });

  it("returns a high score when spatialLabel matches the target label", () => {
    const score = spatialLabelScore(
      target("Email"),
      cand({ spatialLabel: "Email" }),
    );
    expect(score).toBeGreaterThan(0.5);
  });

  it("returns 1.0 for an exact single-word match", () => {
    const score = spatialLabelScore(
      target("Email"),
      cand({ spatialLabel: "Email" }),
    );
    expect(score).toBe(1);
  });

  it("returns a partial score for partial word overlap", () => {
    const score = spatialLabelScore(
      target("Email Address"),
      cand({ spatialLabel: "Email" }),
    );
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("is case-insensitive", () => {
    const score = spatialLabelScore(
      target("email"),
      cand({ spatialLabel: "EMAIL" }),
    );
    expect(score).toBe(1);
  });

  it("returns 0 for completely unrelated text", () => {
    const score = spatialLabelScore(
      target("Password"),
      cand({ spatialLabel: "Unrelated xyz abc" }),
    );
    expect(score).toBe(0);
  });
});
