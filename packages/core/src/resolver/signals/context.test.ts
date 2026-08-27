import type { Tier1Target } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import type { DomCandidate, PageContext } from "../base.js";
import { ContextSignal } from "./context.js";

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

function target(over: Partial<Tier1Target>): Tier1Target {
  return {
    label: "Email",
    semantics: ["email"],
    role: "textbox",
    actions: ["type"],
    intent: "enter email address",
    ...over,
  };
}

function cand(over: Partial<DomCandidate>): DomCandidate {
  return { id: "c", selector: "#c", tag: "input", ...over };
}

describe("ContextSignal", () => {
  const signal = new ContextSignal();

  it("returns the neutral 0.5 prior with no corroborating evidence", () => {
    expect(signal.score(target({}), cand({}), page({}))).toBeCloseTo(0.5, 10);
  });

  it("rewards a form-region candidate when the page has a form", () => {
    const score = signal.score(
      target({}),
      cand({ region: "form" }),
      page({ hasForm: true }),
    );
    expect(score).toBeCloseTo(0.7, 10);
  });

  it("does not reward a form-region candidate when the page-level flag is false", () => {
    const score = signal.score(
      target({}),
      cand({ region: "form" }),
      page({ hasForm: false }),
    );
    expect(score).toBeCloseTo(0.5, 10);
  });

  it("rewards a modal-region candidate when the page has a modal", () => {
    const score = signal.score(
      target({}),
      cand({ region: "modal" }),
      page({ hasModal: true }),
    );
    expect(score).toBeCloseTo(0.7, 10);
  });

  it("stacks form and modal bonuses if a candidate is (unusually) tagged for both signals", () => {
    // region can only be one value, but hasForm+hasModal can both be true on the page;
    // only the matching region contributes, so this just re-confirms single-bonus behavior
    const score = signal.score(
      target({}),
      cand({ region: "form" }),
      page({ hasForm: true, hasModal: true }),
    );
    expect(score).toBeCloseTo(0.7, 10);
  });

  it("adds nearby-text Jaccard overlap against the target label", () => {
    // intent pinned to a disjoint phrase so only the label-vs-nearbyText overlap contributes.
    const score = signal.score(
      target({ label: "email address", intent: "zzz-no-overlap" }),
      cand({ nearbyText: "enter your email address here" }),
      page({}),
    );
    // jaccard({enter,your,email,address,here}, {email,address}): inter=2, union=5+2-2=5 -> 0.4
    // contributes 0.4*0.3=0.12 on top of the 0.5 neutral prior
    expect(score).toBeCloseTo(0.5 + 0.4 * 0.3, 5);
  });

  it("uses the better of label-overlap vs intent-overlap for nearby text", () => {
    const score = signal.score(
      target({ label: "zzz", intent: "submit the form now" }),
      cand({ nearbyText: "submit form" }),
      page({}),
    );
    // jaccard(nearbyText, label) = 0 ; jaccard(nearbyText, intent): setA={submit,form} setB={submit,the,form,now}
    // inter=2, union=2+4-2=4 -> 0.5; contributes 0.5*0.3=0.15
    expect(score).toBeCloseTo(0.5 + 0.5 * 0.3, 5);
  });

  it("caps the total score at 1 even when every bonus stacks", () => {
    const score = signal.score(
      target({ label: "confirm delete item" }),
      cand({ region: "modal", nearbyText: "confirm delete item permanently" }),
      page({ hasModal: true }),
    );
    expect(score).toBeLessThanOrEqual(1);
  });

  it("ignores nearbyText when absent, leaving only the region bonus", () => {
    const score = signal.score(
      target({}),
      cand({ region: "form" }),
      page({ hasForm: true }),
    );
    expect(score).toBeCloseTo(0.7, 10);
  });

  it("adds controlledContent Jaccard overlap against the target intent", () => {
    const score = signal.score(
      target({ label: "zzz-no-overlap", intent: "open the account menu" }),
      cand({ controlledContent: "Sign Out Account Settings" }),
      page({}),
    );
    // jaccard({sign,out,account,settings}, {open,the,account,menu}): inter=1, union=4+4-1=7 -> 1/7
    expect(score).toBeCloseTo(0.5 + (1 / 7) * 0.2, 5);
  });

  it("ignores controlledContent when absent, leaving the score unaffected", () => {
    const score = signal.score(
      target({ intent: "open the account menu" }),
      cand({ region: "form" }),
      page({ hasForm: true }),
    );
    expect(score).toBeCloseTo(0.7, 10);
  });

  it("stacks nearbyText and controlledContent bonuses independently, capped at 1", () => {
    const score = signal.score(
      target({ label: "account", intent: "open the account menu" }),
      cand({
        region: "modal",
        nearbyText: "account settings",
        controlledContent: "sign out account",
      }),
      page({ hasModal: true }),
    );
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThan(0.7); // region bonus alone would only reach 0.7
  });
});
