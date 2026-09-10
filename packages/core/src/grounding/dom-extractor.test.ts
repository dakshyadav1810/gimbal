// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { extractInteractiveElementsInPage } from "./dom-extractor.js";

// jsdom does not implement CSS.escape (it's a real browser API Playwright's actual pages have,
// but jsdom's DOM approximation omits) — polyfill it with the same CSSOM algorithm so this test
// exercises dom-extractor.ts's real escaping logic instead of skipping it with a TypeError.
if (typeof (globalThis as any).CSS === "undefined") {
  (globalThis as any).CSS = {};
}
(globalThis as any).CSS.escape = (value: string): string => {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const code = value.charCodeAt(i);
    if (code === 0x0000) {
      result += "�";
      continue;
    }
    if (
      (code >= 0x0001 && code <= 0x001f) ||
      code === 0x007f ||
      (i === 0 && code >= 0x0030 && code <= 0x0039) ||
      (i === 1 &&
        code >= 0x0030 &&
        code <= 0x0039 &&
        value.charCodeAt(0) === 0x002d)
    ) {
      result += `\\${code.toString(16)} `;
      continue;
    }
    if (i === 0 && char === "-" && value.length === 1) {
      result += `\\${char}`;
      continue;
    }
    if (
      code >= 0x0080 ||
      char === "-" ||
      char === "_" ||
      (code >= 0x0030 && code <= 0x0039) ||
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a)
    ) {
      result += char;
      continue;
    }
    result += `\\${char}`;
  }
  return result;
};

// jsdom's getBoundingClientRect() always returns an all-zero rect; stub it per element so the
// `visible` computation (which requires width/height > 0) actually exercises both branches.
function stubRect(
  el: HTMLElement,
  rect: Partial<DOMRect> = { x: 0, y: 0, width: 100, height: 20 },
) {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON() {},
      ...rect,
    }) as DOMRect;
}

function setup(html: string): HTMLElement[] {
  document.body.innerHTML = html;
  const els = Array.from(document.body.querySelectorAll("*")) as HTMLElement[];
  for (const el of els) stubRect(el);
  return els;
}

describe("extractInteractiveElementsInPage", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds interactive elements matching the selector list and skips non-interactive ones", () => {
    setup(`
      <div>
        <button id="submit">Go</button>
        <p>not interactive</p>
        <a href="/x">link</a>
      </div>
    `);
    const found = extractInteractiveElementsInPage();
    expect(found.map((e) => e.tag).sort()).toEqual(["a", "button"]);
  });

  it("escapes a React useId()-shaped id (containing ':') in cssSelector instead of producing invalid CSS", () => {
    setup(`<button id=":r1:-form-item">Submit</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.cssSelector).toBe("#\\:r1\\:-form-item");
    // must actually be usable as a real selector, not just escaped-looking
    expect(() => document.querySelector(el.cssSelector)).not.toThrow();
    expect(document.querySelector(el.cssSelector)).toBe(
      document.getElementById(":r1:-form-item"),
    );
  });

  it("wraps a double-quote-bearing id in a single-quoted xpath literal", () => {
    setup(`<button id='weird"id'>Submit</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.xpath).toBe(`//*[@id='weird"id']`);
  });

  it("falls back to concat() when the id contains both quote types", () => {
    const el = document.createElement("button");
    // can't express both-quotes-in-one-attribute via a template literal's outer quoting; set directly
    el.id = `weird"and'id`;
    document.body.appendChild(el);
    stubRect(el);
    const [found] = extractInteractiveElementsInPage();
    expect(found.xpath).toBe(`//*[@id=concat("weird", '"', "and'id")]`);
    expect(() =>
      document.evaluate(
        found.xpath,
        document,
        null,
        XPathResult.ANY_TYPE,
        null,
      ),
    ).not.toThrow();
  });

  it("uses a plain quoted xpath literal when the id has no embedded quote", () => {
    setup(`<button id="submit-btn">Submit</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.xpath).toBe('//*[@id="submit-btn"]');
  });

  it("escapes a quote in data-testid within cssSelector's attribute-selector branch", () => {
    setup(`<button data-testid='foo" onmouseover="x'>Submit</button>`);
    const [el] = extractInteractiveElementsInPage();
    // no live, unescaped '"' left to break out of the attribute-value string
    expect(el.cssSelector).not.toMatch(/testid="foo"/);
    expect(() => document.querySelector(el.cssSelector)).not.toThrow();
  });

  it("prefers id over data-testid over input[type] over xpath, in that order, for cssSelector", () => {
    setup(`
      <input id="i1" type="text" />
      <input data-testid="t2" type="search" />
      <input type="email" />
      <input />
    `);
    const inputs = document.body.querySelectorAll("input");
    inputs.forEach((el) => stubRect(el as HTMLElement));
    const found = extractInteractiveElementsInPage();
    expect(found[0].cssSelector).toBe("#i1");
    expect(found[1].cssSelector).toBe('[data-testid="t2"]');
    expect(found[2].cssSelector).toBe("input[type='email']");
    expect(found[3].cssSelector.startsWith("xpath=")).toBe(true);
  });

  it("resolves accessible name from aria-label first", () => {
    setup(`<button aria-label="Close dialog" title="ignored">X</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.label).toBe("Close dialog");
  });

  it("resolves accessible name via aria-labelledby when aria-label is absent", () => {
    setup(`
      <span id="lbl">Delete item</span>
      <button aria-labelledby="lbl"></button>
    `);
    const found = extractInteractiveElementsInPage();
    const button = found.find((e) => e.tag === "button");
    expect(button?.label).toBe("Delete item");
  });

  it("resolves aria-labelledby recursively when the referenced element's own name comes from aria-label", () => {
    setup(`
      <span id="lbl" aria-label="Close Panel"></span>
      <button aria-labelledby="lbl"></button>
    `);
    const found = extractInteractiveElementsInPage();
    const button = found.find((e) => e.tag === "button");
    expect(button?.label).toBe("Close Panel");
  });

  it("resolves a two-level aria-labelledby chain (A labelledby B, B labelledby C)", () => {
    setup(`
      <span id="c" aria-label="Revoke Access"></span>
      <span id="b" aria-labelledby="c"></span>
      <button aria-labelledby="b"></button>
    `);
    const found = extractInteractiveElementsInPage();
    const button = found.find((e) => e.tag === "button");
    expect(button?.label).toBe("Revoke Access");
  });

  it("does not infinitely recurse when two elements' aria-labelledby point at each other", () => {
    setup(`
      <span id="a" aria-labelledby="b"></span>
      <span id="b" aria-labelledby="a"></span>
      <button aria-labelledby="a"></button>
    `);
    expect(() => extractInteractiveElementsInPage()).not.toThrow();
  });

  it("excludes aria-hidden descendants from a content-based accessible name", () => {
    setup(`
      <button>Delete<span aria-hidden="true"> (permanently, cannot be undone)</span></button>
    `);
    const [el] = extractInteractiveElementsInPage();
    expect(el.label).toBe("Delete");
  });

  it("resolves accessible name via a label[for] association, escaping the id", () => {
    setup(`
      <label for=":r2:-email">Email</label>
      <input id=":r2:-email" />
    `);
    const found = extractInteractiveElementsInPage();
    const input = found.find((e) => e.tag === "input");
    expect(input?.label).toBe("Email");
  });

  it("falls back to placeholder, then title, then trimmed text content, in that order", () => {
    setup(`<input placeholder="Search..." />`);
    const [placeholderEl] = extractInteractiveElementsInPage();
    expect(placeholderEl.label).toBe("Search...");

    document.body.innerHTML = "";
    setup(`<button title="Save changes"></button>`);
    const [titleEl] = extractInteractiveElementsInPage();
    expect(titleEl.label).toBe("Save changes");

    document.body.innerHTML = "";
    setup(`<button>  Click me  </button>`);
    const [textEl] = extractInteractiveElementsInPage();
    expect(textEl.label).toBe("Click me");
  });

  it("strictly excludes elements upfront when display/visibility are hidden, zero size, or aria-hidden", () => {
    document.body.innerHTML = `
      <button id="visible-btn">Visible</button>
      <button id="hidden-style" style="display:none">Hidden</button>
      <button id="zero-size">Zero size</button>
      <button id="aria-hidden-btn" aria-hidden="true">Aria Hidden</button>
      <div id="drawer" aria-hidden="true">
        <button id="drawer-btn">Inside Drawer</button>
      </div>
    `;
    const visibleBtn = document.getElementById("visible-btn") as HTMLElement;
    const hiddenBtn = document.getElementById("hidden-style") as HTMLElement;
    const zeroBtn = document.getElementById("zero-size") as HTMLElement;
    const ariaHiddenBtn = document.getElementById("aria-hidden-btn") as HTMLElement;
    const drawerBtn = document.getElementById("drawer-btn") as HTMLElement;

    stubRect(visibleBtn, { width: 100, height: 20 });
    stubRect(hiddenBtn, { width: 100, height: 20 });
    stubRect(zeroBtn, { width: 0, height: 0 });
    stubRect(ariaHiddenBtn, { width: 100, height: 20 });
    stubRect(drawerBtn, { width: 100, height: 20 });

    const found = extractInteractiveElementsInPage();
    expect(found.find((e) => e.attributes.id === "visible-btn")).toBeDefined();
    expect(found.find((e) => e.attributes.id === "hidden-style")).toBeUndefined();
    expect(found.find((e) => e.attributes.id === "zero-size")).toBeUndefined();
    expect(found.find((e) => e.attributes.id === "aria-hidden-btn")).toBeUndefined();
    expect(found.find((e) => e.attributes.id === "drawer-btn")).toBeUndefined();
  });

  it("extracts accessible names from enclosed SVG aria-label or title for icon-only buttons", () => {
    document.body.innerHTML = `
      <button id="icon-btn-label">
        <svg aria-label="Search icon"></svg>
      </button>
      <button id="icon-btn-title">
        <svg><title>Close dialog</title></svg>
      </button>
    `;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      stubRect(el as HTMLElement);
    }
    const found = extractInteractiveElementsInPage();
    const btnLabel = found.find((e) => e.attributes.id === "icon-btn-label");
    const btnTitle = found.find((e) => e.attributes.id === "icon-btn-title");
    expect(btnLabel?.label).toBe("Search icon");
    expect(btnTitle?.label).toBe("Close dialog");
  });

  it("computes disabled from the disabled property and aria-disabled attribute", () => {
    setup(`
      <button id="d1" disabled>Disabled</button>
      <button id="d2" aria-disabled="true">Also disabled</button>
      <button id="d3">Enabled</button>
    `);
    const found = extractInteractiveElementsInPage();
    expect(found.find((e) => e.attributes.id === "d1")?.disabled).toBe(true);
    expect(found.find((e) => e.attributes.id === "d2")?.disabled).toBe(true);
    expect(found.find((e) => e.attributes.id === "d3")?.disabled).toBe(false);
  });

  it("determines region as modal, form, or section based on the closest ancestor", () => {
    setup(`
      <div role="dialog"><button id="in-modal">X</button></div>
      <form><button id="in-form">X</button></form>
      <section><button id="in-section">X</button></section>
      <button id="in-none">X</button>
    `);
    const found = extractInteractiveElementsInPage();
    expect(found.find((e) => e.attributes.id === "in-modal")?.region).toBe(
      "modal",
    );
    expect(found.find((e) => e.attributes.id === "in-form")?.region).toBe(
      "form",
    );
    expect(found.find((e) => e.attributes.id === "in-section")?.region).toBe(
      "section",
    );
    expect(found.find((e) => e.attributes.id === "in-none")?.region).toBeNull();
  });

  it("builds contextPath/ancestorChain up to 5 ancestors deep, escaping any ancestor id", () => {
    setup(`
      <div id="root">
        <div id="mid:colon">
          <div><div><div><div>
            <button id="deep">X</button>
          </div></div></div></div>
        </div>
      </div>
    `);
    const [btn] = extractInteractiveElementsInPage();
    expect(btn.contextPath.length).toBe(5);
    expect(btn.contextPath).toEqual(btn.ancestorChain);
    expect(btn.contextPath.some((p) => p.includes("#mid\\:colon"))).toBe(true);
  });

  it("computes parentXpath as the immediate parent's own xpath, distinguishing two unid'd sibling wrappers", () => {
    setup(`
      <div><button id="in-first">A</button></div>
      <div><button id="in-second">B</button></div>
    `);
    const found = extractInteractiveElementsInPage();
    const first = found.find((e) => e.attributes.id === "in-first");
    const second = found.find((e) => e.attributes.id === "in-second");
    expect(first?.parentXpath).toBeTruthy();
    expect(second?.parentXpath).toBeTruthy();
    expect(first?.parentXpath).not.toBe(second?.parentXpath);
  });

  it("computes siblingIndex among same-tag siblings", () => {
    setup(`
      <div>
        <button id="b0">A</button>
        <button id="b1">B</button>
        <input id="i0" />
      </div>
    `);
    const found = extractInteractiveElementsInPage();
    expect(found.find((e) => e.attributes.id === "b0")?.siblingIndex).toBe(0);
    expect(found.find((e) => e.attributes.id === "b1")?.siblingIndex).toBe(1);
    expect(found.find((e) => e.attributes.id === "i0")?.siblingIndex).toBe(0);
  });

  it("captures every attribute verbatim into `attributes`, including data-testid", () => {
    setup(
      `<button id="x" data-testid="save-btn" role="button" data-foo="bar">Save</button>`,
    );
    const [el] = extractInteractiveElementsInPage();
    expect(el.attributes).toMatchObject({
      id: "x",
      "data-testid": "save-btn",
      role: "button",
      "data-foo": "bar",
    });
    expect(el.testId).toBe("save-btn");
    expect(el.role).toBe("button");
  });

  it("truncates nearbyText (parent textContent) to 200 characters", () => {
    const long = "x".repeat(300);
    setup(`<div>${long}<button id="b">Go</button></div>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.nearbyText?.length).toBeLessThanOrEqual(200);
  });

  it("resolves controlledContent from an aria-controls target even when it's display:none", () => {
    document.body.innerHTML = `
      <button id="trigger" aria-controls="menu" aria-haspopup="menu">Account</button>
      <div id="menu" style="display:none"><button>Sign Out</button><span>Account</span></div>
    `;
    for (const el of Array.from(document.body.querySelectorAll("*")))
      stubRect(el as HTMLElement);
    const found = extractInteractiveElementsInPage();
    const trigger = found.find((e) => e.attributes.id === "trigger");
    expect(trigger?.controlledContent).toBe("Sign OutAccount");
  });

  it("resolves controlledContent from aria-owns when aria-controls is absent", () => {
    setup(`
      <button id="trigger" aria-owns="panel">Menu</button>
      <div id="panel">Light Dark System</div>
    `);
    const found = extractInteractiveElementsInPage();
    const trigger = found.find((e) => e.attributes.id === "trigger");
    expect(trigger?.controlledContent).toBe("Light Dark System");
  });

  it("leaves controlledContent undefined when aria-controls references a non-existent id", () => {
    setup(`<button id="trigger" aria-controls="does-not-exist">Menu</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.controlledContent).toBeUndefined();
  });

  it("leaves controlledContent undefined when there is no aria-controls/aria-owns", () => {
    setup(`<button id="trigger">Menu</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.controlledContent).toBeUndefined();
  });

  it("truncates controlledContent to 200 characters", () => {
    const long = "x ".repeat(300);
    setup(`
      <button id="trigger" aria-controls="menu">Menu</button>
      <div id="menu">${long}</div>
    `);
    const [el] = extractInteractiveElementsInPage();
    expect(el.controlledContent?.length).toBeLessThanOrEqual(200);
  });

  // --- Volatile ID Filtering ---
  it("omits a React useId() volatile ID (:r1:) from cssSelector, falling back to data-testid", () => {
    setup(`<input id=":r1:" data-testid="email-input" type="email" />`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.cssSelector).not.toMatch(/^#/);
    expect(el.cssSelector).toBe('[data-testid="email-input"]');
  });

  it("omits a React useId() volatile ID from xpathFor, building structural XPath instead", () => {
    setup(`<button id=":r2:">Submit</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.xpath).not.toContain(":r2:");
    expect(el.xpath).toMatch(/^\//);
  });

  it("omits a Radix UI volatile ID (radix-xyz) from cssSelector, falling back to xpath", () => {
    setup(`<button id="radix-abc123">Open</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.cssSelector).not.toMatch(/^#radix/);
  });

  it("treats a stable non-volatile id normally (keeps it in cssSelector and xpath)", () => {
    setup(`<button id="submit-btn">Submit</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.cssSelector).toBe("#submit-btn");
    expect(el.xpath).toContain("submit-btn");
  });

  // --- Spatial Label Extraction ---
  it("extracts spatialLabel from a sibling label element positioned above the input", () => {
    document.body.innerHTML = `
      <div id="field-wrapper">
        <label id="lbl">Email Address</label>
        <input id="email-input" type="email" />
      </div>
    `;
    const label = document.getElementById("lbl") as HTMLElement;
    const input = document.getElementById("email-input") as HTMLElement;
    label.getBoundingClientRect = () =>
      ({
        x: 10,
        y: 0,
        width: 100,
        height: 20,
        top: 0,
        left: 10,
        right: 110,
        bottom: 20,
        toJSON() {},
      }) as DOMRect;
    input.getBoundingClientRect = () =>
      ({
        x: 10,
        y: 24,
        width: 200,
        height: 30,
        top: 24,
        left: 10,
        right: 210,
        bottom: 54,
        toJSON() {},
      }) as DOMRect;
    const wrapper = document.getElementById("field-wrapper") as HTMLElement;
    stubRect(wrapper);
    const found = extractInteractiveElementsInPage();
    const inputEl = found.find((e) => e.attributes.id === "email-input");
    expect(inputEl?.spatialLabel).toBe("Email Address");
  });

  it("leaves spatialLabel undefined when no text node is in the label quadrant", () => {
    setup(`<button id="isolated">Submit</button>`);
    const [el] = extractInteractiveElementsInPage();
    expect(el.spatialLabel).toBeUndefined();
  });

  it("extracts accessible name from wrapped <label> without for attribute", () => {
    setup(`
      <form>
        <label id="lbl-wrap">
          Confirm Password
          <input type="password" id="confirm-pwd" />
        </label>
      </form>
    `);
    const input = document.getElementById("confirm-pwd") as HTMLElement;
    stubRect(input);
    const found = extractInteractiveElementsInPage();
    const candidate = found.find((c) => c.attributes.id === "confirm-pwd");
    expect(candidate?.label).toBe("Confirm Password");
  });

  it("extracts accessible name from multi-ID aria-labelledby", () => {
    setup(`
      <span id="prefix">Billing</span>
      <span id="suffix">Zip Code</span>
      <input id="zip" aria-labelledby="prefix suffix" />
    `);
    const input = document.getElementById("zip") as HTMLElement;
    stubRect(input);
    const found = extractInteractiveElementsInPage();
    const candidate = found.find((c) => c.attributes.id === "zip");
    expect(candidate?.label).toBe("Billing Zip Code");
  });

  it("guarantees unique selector synthesis for duplicate input types without collision", () => {
    setup(`
      <form>
        <input type="password" placeholder="Enter password" />
        <input type="password" placeholder="Confirm password" />
      </form>
    `);
    const inputs = document.querySelectorAll("input");
    inputs.forEach((inp) => stubRect(inp));
    const found = extractInteractiveElementsInPage();
    expect(found.length).toBe(2);
    // Neither should have the colliding bare "input[type='password']"
    expect(found[0].cssSelector).not.toBe("input[type='password']");
    expect(found[1].cssSelector).not.toBe("input[type='password']");
    // They should use unique placeholder selectors
    expect(found[0].cssSelector).toBe("input[placeholder=\"Enter\\ password\"]");
    expect(found[1].cssSelector).toBe("input[placeholder=\"Confirm\\ password\"]");
  });

  it("falls back to unique positional xpath when multiple identical inputs lack distinguishing attributes", () => {
    setup(`
      <div>
        <input type="password" />
        <input type="password" />
      </div>
    `);
    const inputs = document.querySelectorAll("input");
    inputs.forEach((inp) => stubRect(inp));
    const found = extractInteractiveElementsInPage();
    expect(found.length).toBe(2);
    expect(found[0].cssSelector).toContain("xpath=");
    expect(found[1].cssSelector).toContain("xpath=");
    expect(found[0].cssSelector).not.toBe(found[1].cssSelector);
  });
});

