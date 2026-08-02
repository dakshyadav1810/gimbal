import type { Tier1Target } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import type { DomCandidate, PageContext } from "../base.js";
import { StructureSignal } from "./structure.js";

const page: PageContext = {
  textDensity: 0,
  iconRatio: 0,
  hasForm: false,
  hasModal: false,
  repeatedStructure: false,
};

function target(over: Partial<Tier1Target>): Tier1Target {
  return {
    label: "x",
    semantics: ["x"],
    role: "button",
    actions: ["click"],
    intent: "x",
    ...over,
  };
}

function cand(over: Partial<DomCandidate>): DomCandidate {
  return { id: "c", selector: "#c", tag: "div", ...over };
}

describe("StructureSignal", () => {
  const signal = new StructureSignal();

  it("scores a data-testid candidate at the max regardless of anything else", () => {
    const score = signal.score(target({ role: "textbox" }), cand({ testId: "x", tag: "div" }), page);
    expect(score).toBe(1);
  });

  it("gives full role-match credit for an exact role match", () => {
    const score = signal.score(target({ role: "button" }), cand({ role: "button", tag: "button" }), page);
    expect(score).toBeCloseTo(0.4, 10); // 0.4 role match, no id/xpath/contextPath
  });

  it("gives partial credit for a role reachable via the ROLE_SYNONYMS table (role field)", () => {
    // wantRole "textbox", candidate role "input" is listed as a textbox synonym
    const score = signal.score(target({ role: "textbox" }), cand({ role: "input", tag: "input" }), page);
    expect(score).toBeCloseTo(0.3, 10);
  });

  it("gives lesser partial credit when only the tag (not role) matches the synonym table", () => {
    const score = signal.score(target({ role: "link" }), cand({ tag: "a", role: undefined }), page);
    expect(score).toBeCloseTo(0.2, 10);
  });

  it("gives zero role-related credit for an unmapped role with no synonym entry", () => {
    const score = signal.score(target({ role: "checkbox" }), cand({ role: "radio", tag: "input" }), page);
    expect(score).toBeCloseTo(0, 10);
  });

  it("adds id-attribute credit independent of role match", () => {
    const score = signal.score(
      target({ role: "button" }),
      cand({ role: "button", tag: "button", attributes: { id: "submit-btn" } }),
      page,
    );
    expect(score).toBeCloseTo(0.4 + 0.3, 10);
  });

  it("adds xpath and contextPath credit additively", () => {
    const score = signal.score(
      target({ role: "button" }),
      cand({
        role: "button",
        tag: "button",
        xpath: "/html/body/button",
        contextPath: ["form", "div"],
      }),
      page,
    );
    expect(score).toBeCloseTo(0.4 + 0.15 + 0.15, 10);
  });

  it("caps the total at 1 even when every bonus applies", () => {
    const score = signal.score(
      target({ role: "button" }),
      cand({
        role: "button",
        tag: "button",
        attributes: { id: "x" },
        xpath: "/a",
        contextPath: ["a"],
      }),
      page,
    );
    expect(score).toBe(1);
  });

  it("scores a candidate with none of the structural anchors at 0", () => {
    const score = signal.score(target({ role: "button" }), cand({ tag: "div" }), page);
    expect(score).toBe(0);
  });

  it("is case-insensitive when comparing roles (cand.role is live, uncontrolled DOM data)", () => {
    const score = signal.score(target({ role: "button" }), cand({ role: "Button", tag: "button" }), page);
    expect(score).toBeCloseTo(0.4, 10);
  });
});
