import { describe, expect, it } from "vitest";
import type { Candidate } from "@gimbal/shared";
import { durableSelector } from "./gate.js";

function candidate(anchors: Candidate["anchors"], selector = "div"): Candidate {
  return {
    id: "c1",
    selector,
    anchors,
    signals: { semantics: 0, affordance: 0, context: 0, structure: 0, index: 0 },
    score: 0,
    band: "high",
  };
}

describe("durableSelector", () => {
  it("escapes React useId()-shaped ids so the selector stays valid CSS", () => {
    const winner = candidate({ attributes: { id: ":r1:-form-item" } });
    const selector = durableSelector(winner);
    expect(selector).toBe("#\\:r1\\:-form-item");
    // no unescaped `:` left — a raw `#:r1:-form-item` is invalid CSS and throws in Playwright/browsers
    expect(selector.replace(/\\:/g, "")).not.toContain(":");
  });

  it("escapes a quote in data-testid instead of breaking out of the attribute value", () => {
    const winner = candidate({ testId: 'foo" i][x="y' });
    const selector = durableSelector(winner);
    // the embedded `"` must come out escaped (\"), not as a live quote that closes the attribute value early
    expect(selector).toBe('[data-testid="foo\\"\\ i\\]\\[x\\=\\"y"]');
    expect(selector.match(/(?<!\\)"/g)?.length).toBe(2); // only the two selector-literal quotes are unescaped
  });

  it("prefers testId over id, and escapes it", () => {
    const winner = candidate({ testId: "submit-btn", attributes: { id: "submit" } });
    expect(durableSelector(winner)).toBe('[data-testid="submit-btn"]');
  });

  it("falls back to the plain selector when no anchors are present", () => {
    const winner = candidate({}, 'xpath=//*[@id="x"]');
    expect(durableSelector(winner)).toBe('xpath=//*[@id="x"]');
  });

  it("still escapes a plain alphanumeric id predictably (no double-escaping)", () => {
    const winner = candidate({ attributes: { id: "email" } });
    expect(durableSelector(winner)).toBe("#email");
  });
});
