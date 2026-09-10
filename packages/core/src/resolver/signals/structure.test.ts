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
    const score = signal.score(
      target({ role: "textbox" }),
      cand({ testId: "x", tag: "div" }),
      page,
    );
    expect(score).toBe(1);
  });

  it("gives full role-match credit for an exact role match", () => {
    const score = signal.score(
      target({ role: "button" }),
      cand({ role: "button", tag: "button" }),
      page,
    );
    expect(score).toBeCloseTo(0.4, 10); // 0.4 role match, no id/xpath/contextPath
  });

  it("gives partial credit for a role reachable via the ROLE_SYNONYMS table (role field)", () => {
    // wantRole "textbox", candidate role "input" is listed as a textbox synonym
    const score = signal.score(
      target({ role: "textbox" }),
      cand({ role: "input", tag: "input" }),
      page,
    );
    expect(score).toBeCloseTo(0.3, 10);
  });

  it("gives lesser partial credit when only the tag (not role) matches the synonym table", () => {
    const score = signal.score(
      target({ role: "link" }),
      cand({ tag: "a", role: undefined }),
      page,
    );
    expect(score).toBeCloseTo(0.2, 10);
  });

  it("gives zero role-related credit for an unmapped role with no synonym entry", () => {
    const score = signal.score(
      target({ role: "checkbox" }),
      cand({ role: "radio", tag: "input" }),
      page,
    );
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

  it("adds xpath and contextPath credit additively when the xpath is the cheap id-anchored form", () => {
    const score = signal.score(
      target({ role: "button" }),
      cand({
        role: "button",
        tag: "button",
        xpath: '//*[@id="submit"]',
        contextPath: ["form", "div"],
      }),
      page,
    );
    expect(score).toBeCloseTo(0.4 + 0.15 + 0.15, 10);
  });

  it("does not reward a positional (non-id-anchored) xpath — it doesn't survive DOM reshuffles", () => {
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
    expect(score).toBeCloseTo(0.4 + 0.15, 10); // contextPath credit only, no xpath bonus
  });

  it("rewards a candidate whose input[type] matches the family implied by a 'type' action", () => {
    const score = signal.score(
      target({ role: "textbox", actions: ["type"] }),
      cand({ role: "textbox", tag: "input", attributes: { type: "email" } }),
      page,
    );
    expect(score).toBeCloseTo(0.4 + 0.1, 10);
  });

  it("does not reward a type mismatch (reward-only, never a penalty)", () => {
    const score = signal.score(
      target({ role: "textbox", actions: ["type"] }),
      cand({ role: "textbox", tag: "input", attributes: { type: "checkbox" } }),
      page,
    );
    expect(score).toBeCloseTo(0.4, 10);
  });

  it("rewards a checkbox/radio candidate for a 'check' action", () => {
    const score = signal.score(
      target({ role: "checkbox", actions: ["check"] }),
      cand({
        role: "checkbox",
        tag: "input",
        attributes: { type: "checkbox" },
      }),
      page,
    );
    expect(score).toBeCloseTo(0.4 + 0.1, 10);
  });

  it("rewards a candidate whose id lexically resembles the label more closely (proportional, not all-or-nothing)", () => {
    const fullMatch = signal.score(
      target({ role: "textbox", label: "Confirm Password" }),
      cand({
        role: "textbox",
        tag: "input",
        attributes: { id: "password-confirm" },
      }),
      page,
    );
    const partialMatch = signal.score(
      target({ role: "textbox", label: "Confirm Password" }),
      cand({ role: "textbox", tag: "input", attributes: { id: "password" } }),
      page,
    );
    // id="password-confirm" contains both label words (jaccard 1.0 -> full +0.15 bonus).
    expect(fullMatch).toBeCloseTo(0.4 + 0.3 + 0.15, 10);
    // id="password" contains only "password", not "confirm" (jaccard 0.5 -> partial +0.075) — a
    // real, if partial, credit rather than zero, since it does share the head noun.
    expect(partialMatch).toBeCloseTo(0.4 + 0.3 + 0.075, 10);
    expect(fullMatch).toBeGreaterThan(partialMatch);
  });

  it("scores a superset match lower than a tighter match (extra unrelated tokens hurt similarity)", () => {
    const tight = signal.score(
      target({ role: "textbox", label: "New Password" }),
      cand({
        role: "textbox",
        tag: "input",
        attributes: { id: "new-pw", name: "new_password" },
      }),
      page,
    );
    const superset = signal.score(
      target({ role: "textbox", label: "New Password" }),
      cand({
        role: "textbox",
        tag: "input",
        attributes: { id: "confirm-pw", name: "confirm_new_password" },
      }),
      page,
    );
    expect(tight).toBeGreaterThan(superset);
  });

  it("does not apply the modifier bonus for a single-word label (no modifier to check)", () => {
    const score = signal.score(
      target({ role: "button", label: "Close" }),
      cand({ role: "button", tag: "button", attributes: { id: "close-btn" } }),
      page,
    );
    expect(score).toBeCloseTo(0.4 + 0.3, 10);
  });

  it("caps the total at 1 even when every bonus applies", () => {
    const score = signal.score(
      target({ role: "button" }),
      cand({
        role: "button",
        tag: "button",
        attributes: { id: "x" },
        xpath: '//*[@id="x"]',
        contextPath: ["a"],
      }),
      page,
    );
    expect(score).toBe(1);
  });

  it("scores a candidate with none of the structural anchors at 0", () => {
    const score = signal.score(
      target({ role: "button" }),
      cand({ tag: "div" }),
      page,
    );
    expect(score).toBe(0);
  });

  it("is case-insensitive when comparing roles (cand.role is live, uncontrolled DOM data)", () => {
    const score = signal.score(
      target({ role: "button" }),
      cand({ role: "Button", tag: "button" }),
      page,
    );
    expect(score).toBeCloseTo(0.4, 10);
  });
});
