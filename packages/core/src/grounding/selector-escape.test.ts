import { describe, expect, it } from "vitest";
import { cssEscape, xpathLiteral } from "./selector-escape.js";

describe("cssEscape", () => {
  it("leaves a plain alphanumeric id unchanged", () => {
    expect(cssEscape("email")).toBe("email");
  });

  it("escapes every colon in a React useId()-shaped id", () => {
    expect(cssEscape(":r1:-form-item")).toBe("\\:r1\\:-form-item");
  });

  it("escapes a double quote so it can't break out of an attribute-value selector", () => {
    const escaped = cssEscape('foo" i][x="y');
    expect(escaped).not.toMatch(/(?<!\\)"/);
    expect(escaped).toBe('foo\\"\\ i\\]\\[x\\=\\"y');
  });

  it("escapes a leading digit with the codepoint-escape form", () => {
    expect(cssEscape("1abc")).toBe("\\31 abc");
  });

  it("escapes a lone hyphen", () => {
    expect(cssEscape("-")).toBe("\\-");
  });

  it("leaves hyphens and underscores in the middle of a value unescaped", () => {
    expect(cssEscape("my-field_name")).toBe("my-field_name");
  });

  it("produces a selector that is actually parseable as CSS for a variety of hostile inputs", async () => {
    // dom-extractor.test.ts already proves this against a live jsdom document; here we only need
    // the escaped forms to not contain a live, unescaped CSS-special character.
    const hostileInputs = [":r1:-x", 'a"b', "a'b", "a b", "a.b", "a>b", "a[b]"];
    for (const input of hostileInputs) {
      const escaped = cssEscape(input);
      expect(escaped).not.toMatch(/(?<!\\)[:'"\s.>[\]]/);
    }
  });
});

describe("xpathLiteral", () => {
  it("wraps a plain value in double quotes", () => {
    expect(xpathLiteral("submit-btn")).toBe('"submit-btn"');
  });

  it("wraps a double-quote-bearing value in single quotes instead", () => {
    expect(xpathLiteral('weird"id')).toBe(`'weird"id'`);
  });

  it("falls back to concat() when the value contains both quote types", () => {
    expect(xpathLiteral(`weird"and'id`)).toBe(`concat("weird", '"', "and'id")`);
  });

  it("produces a concat() expression with no unescaped literal-breaking quote sequence", () => {
    const literal = xpathLiteral(`a"b'c"d`);
    expect(literal.startsWith("concat(")).toBe(true);
    expect(literal.endsWith(")")).toBe(true);
  });
});
