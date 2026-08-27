import type { Tier1Target } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import type { DomCandidate, PageContext } from "../base.js";
import { IndexSignal } from "./index-signal.js";

const page: PageContext = {
  textDensity: 0,
  iconRatio: 0,
  hasForm: false,
  hasModal: false,
  repeatedStructure: false,
};

const target: Tier1Target = {
  label: "x",
  semantics: ["x"],
  role: "button",
  actions: ["click"],
  intent: "x",
};

describe("IndexSignal", () => {
  const signal = new IndexSignal();

  it("returns a neutral 0.5 when siblingIndex is present", () => {
    const cand: DomCandidate = {
      id: "c",
      selector: "#c",
      tag: "div",
      siblingIndex: 2,
    };
    expect(signal.score(target, cand, page)).toBe(0.5);
  });

  it("returns 0 when siblingIndex is absent, since there's nothing to tiebreak on", () => {
    const cand: DomCandidate = { id: "c", selector: "#c", tag: "div" };
    expect(signal.score(target, cand, page)).toBe(0);
  });

  it("treats siblingIndex 0 as present, not absent (must check undefined, not falsiness)", () => {
    const cand: DomCandidate = {
      id: "c",
      selector: "#c",
      tag: "div",
      siblingIndex: 0,
    };
    expect(signal.score(target, cand, page)).toBe(0.5);
  });
});
