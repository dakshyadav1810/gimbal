import { describe, expect, it } from "vitest";
import type { DomCandidate } from "../resolver/base.js";
import { compareEffect, computeEffect } from "./verify.js";

const el = (label: string, role = "button") =>
  ({ id: label, selector: `#${label}`, tag: "button", role, label }) as DomCandidate;

describe("computeEffect", () => {
  it("ignores digits, so badge counts and timestamps don't count as change", () => {
    const e = computeEffect(
      [el("Inbox 3"), el("Go")],
      [el("Inbox 4"), el("Go")],
      "http://x/a",
      "http://x/a",
    );
    expect(e).toMatchObject({ urlPathChanged: false, appeared: [], disappeared: [] });
  });

  it("skips the acted-on element's own label", () => {
    const e = computeEffect([el("Log In"), el("Help")], [el("Help")], "http://x/", "http://x/", "Log In");
    expect(e.disappeared).toEqual([]);
  });

  it("treats ids in the path as the same page", () => {
    const e = computeEffect([], [], "http://x/item/12", "http://x/item/98");
    expect(e.urlPathChanged).toBe(false);
  });
});

describe("compareEffect", () => {
  const nav = { urlPathChanged: true, toPath: "/done", appeared: [], disappeared: [] };
  const popup = { urlPathChanged: false, appeared: ["dialog:thanks", "button:close"], disappeared: [] };

  it("verifies a matching navigation", () => {
    expect(compareEffect(nav, nav).result).toBe("verified");
  });
  it("flags navigation that did not happen", () => {
    expect(compareEffect(nav, { ...nav, urlPathChanged: false, toPath: undefined }).result).toBe("mismatch");
  });
  it("flags navigation to a different page", () => {
    expect(compareEffect(nav, { ...nav, toPath: "/other" }).result).toBe("mismatch");
  });
  it("verifies when the same elements appear", () => {
    expect(compareEffect(popup, popup).result).toBe("verified");
  });
  it("flags a different set of elements appearing", () => {
    expect(compareEffect(popup, { ...popup, appeared: ["alert:error"] }).result).toBe("mismatch");
  });
  it("is inconclusive when grounding saw nothing happen", () => {
    const none = { urlPathChanged: false, appeared: [], disappeared: [] };
    expect(compareEffect(none, none).result).toBe("inconclusive");
  });
});
