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

  it("maps explicit ARIA roles (textbox, searchbox, combobox, switch, link) correctly to actions", () => {
    // type action accepts role="searchbox" and role="textbox" even on non-input tags
    expect(
      signal.score(
        target({ actions: ["type"] }),
        cand({ tag: "div", role: "searchbox" }),
        page,
      ),
    ).toBe(1);
    expect(
      signal.score(
        target({ actions: ["type"] }),
        cand({ tag: "span", role: "textbox" }),
        page,
      ),
    ).toBe(1);

    // click action accepts role="switch", "link", "checkbox", "radio"
    expect(
      signal.score(
        target({ actions: ["click"] }),
        cand({ tag: "span", role: "switch" }),
        page,
      ),
    ).toBe(1);
    expect(
      signal.score(
        target({ actions: ["click"] }),
        cand({ tag: "div", role: "link" }),
        page,
      ),
    ).toBe(1);

    // select action accepts role="combobox", "listbox"
    expect(
      signal.score(
        target({ actions: ["select"] }),
        cand({ tag: "div", role: "combobox" }),
        page,
      ),
    ).toBe(1);
    expect(
      signal.score(
        target({ actions: ["select"] }),
        cand({ tag: "div", role: "listbox" }),
        page,
      ),
    ).toBe(1);
  });

  it("enforces role compatibility when target.role is specified", () => {
    // button target rejects text/password inputs, textarea, select
    const btnTarget = target({ role: "button", actions: ["click"] });
    expect(
      signal.score(
        btnTarget,
        cand({ tag: "input", attributes: { type: "text" }, role: undefined }),
        page,
      ),
    ).toBe(0);
    expect(
      signal.score(
        btnTarget,
        cand({
          tag: "input",
          attributes: { type: "password" },
          role: undefined,
        }),
        page,
      ),
    ).toBe(0);
    expect(
      signal.score(btnTarget, cand({ tag: "textarea", role: undefined }), page),
    ).toBe(0);
    expect(
      signal.score(btnTarget, cand({ tag: "select", role: undefined }), page),
    ).toBe(0);

    // button target accepts buttons, submit inputs, links, and div role="button"
    expect(
      signal.score(btnTarget, cand({ tag: "button", role: "button" }), page),
    ).toBe(1);
    expect(
      signal.score(
        btnTarget,
        cand({ tag: "input", attributes: { type: "submit" }, role: undefined }),
        page,
      ),
    ).toBe(1);
    expect(
      signal.score(btnTarget, cand({ tag: "div", role: "button" }), page),
    ).toBe(1);

    // textbox target rejects buttons, selects, checkboxes
    const txtTarget = target({ role: "textbox", actions: ["type"] });
    expect(
      signal.score(txtTarget, cand({ tag: "button", role: "button" }), page),
    ).toBe(0);
    expect(
      signal.score(txtTarget, cand({ tag: "select", role: "combobox" }), page),
    ).toBe(0);
    expect(
      signal.score(
        txtTarget,
        cand({ tag: "input", attributes: { type: "checkbox" } }),
        page,
      ),
    ).toBe(0);

    // textbox target accepts text/password inputs, textarea, and span role="textbox"
    expect(
      signal.score(
        txtTarget,
        cand({
          tag: "input",
          attributes: { type: "password" },
          role: "textbox",
        }),
        page,
      ),
    ).toBe(1);
    expect(
      signal.score(txtTarget, cand({ tag: "textarea", role: "textbox" }), page),
    ).toBe(1);
    expect(
      signal.score(txtTarget, cand({ tag: "span", role: "textbox" }), page),
    ).toBe(1);
  });
});
