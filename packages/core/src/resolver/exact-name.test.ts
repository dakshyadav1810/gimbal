import { describe, expect, it } from "vitest";
import type { DomCandidate } from "./base.js";
import {
  effectiveRole,
  lexicalSupport,
  uniqueExactNameMatch,
} from "./exact-name.js";

const c = (tag: string, label: string, extra: Partial<DomCandidate> = {}) =>
  ({ id: label, selector: label, tag, label, ...extra }) as DomCandidate;

describe("uniqueExactNameMatch", () => {
  it("matches a plain button by its implicit role", () => {
    const list = [c("button", "Sign in"), c("button", "Create account")];
    expect(
      uniqueExactNameMatch({ label: "Create account", role: "button" }, list)
        ?.label,
    ).toBe("Create account");
  });
  it("is not unique when two elements share the name and role", () => {
    const list = [c("button", "Edit"), c("button", "Edit")];
    expect(
      uniqueExactNameMatch({ label: "Edit", role: "button" }, list),
    ).toBeNull();
  });
  it("ignores an element with the right name but the wrong role", () => {
    const list = [c("a", "Sign in")];
    expect(
      uniqueExactNameMatch({ label: "Sign in", role: "button" }, list),
    ).toBeNull();
  });
  it("maps implicit roles", () => {
    expect(effectiveRole(c("a", "x"))).toBe("link");
    expect(
      effectiveRole(c("input", "x", { attributes: { type: "checkbox" } })),
    ).toBe("checkbox");
    expect(effectiveRole(c("input", "x"))).toBe("textbox");
  });
});

describe("lexicalSupport", () => {
  const t = { label: "Edit Alice", semantics: ["edit alice", "modify"] };
  it("rejects a different row's button", () => {
    expect(lexicalSupport(t, "Edit Bob")).toBe(false);
  });
  it("accepts a listed synonym", () => {
    expect(
      lexicalSupport({ label: "Sign in", semantics: ["log in"] }, "Log in"),
    ).toBe(true);
  });
  it("cannot judge an unlabeled element", () => {
    expect(lexicalSupport(t, undefined)).toBe(true);
  });
});
