import type { Tier1Target } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import type { DomCandidate, PageContext } from "../base.js";
import { AffordanceSignal } from "./affordance.js";

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
  return { id: "c", selector: "#c", tag: "button", role: "button", ...over };
}

describe("AffordanceSignal", () => {
  const signal = new AffordanceSignal();

  it("rejects an invisible candidate outright", () => {
    expect(signal.score(target({}), cand({ visible: false }), page)).toBe(0);
  });

  it("rejects a disabled candidate outright", () => {
    expect(signal.score(target({}), cand({ disabled: true }), page)).toBe(0);
  });

  it("accepts a candidate whose tag matches the required action, regardless of role", () => {
    const t = target({ actions: ["type"] });
    expect(signal.score(t, cand({ tag: "input", role: undefined }), page)).toBe(
      1,
    );
  });

  it("accepts a candidate whose role matches even if the tag itself wouldn't", () => {
    const t = target({ actions: ["click"] });
    // a div with role="button" is a common a11y pattern
    expect(signal.score(t, cand({ tag: "div", role: "button" }), page)).toBe(1);
  });

  it("rejects a candidate whose tag and role both fail every requested action", () => {
    const t = target({ actions: ["type"] });
    expect(
      signal.score(t, cand({ tag: "div", role: "presentation" }), page),
    ).toBe(0);
  });

  it("requires every action in a multi-action target to be satisfiable", () => {
    // "focus" allows input/textarea/select/button/a; "type" allows only input/textarea
    const t = target({ actions: ["focus", "type"] });
    expect(
      signal.score(t, cand({ tag: "select", role: "combobox" }), page),
    ).toBe(0);
    expect(signal.score(t, cand({ tag: "input", role: "textbox" }), page)).toBe(
      1,
    );
  });

  it("ignores an action with no defined tag mapping rather than rejecting", () => {
    const t = target({ actions: ["submit"] }); // not in ACTION_TAGS
    expect(signal.score(t, cand({ tag: "button", role: "button" }), page)).toBe(
      1,
    );
  });

  it("treats an empty actions list as automatically satisfied", () => {
    const t = target({ actions: [] });
    expect(
      signal.score(t, cand({ tag: "div", role: "presentation" }), page),
    ).toBe(1);
  });
});
