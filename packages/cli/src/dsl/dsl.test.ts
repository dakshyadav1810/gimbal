import { type SpecIR, type UiStep, lintSpec } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import { compileDsl } from "./compiler.js";
import { decompileSpec } from "./decompiler.js";
import { parseDsl } from "./parser.js";

// ─── Shared fixture ───────────────────────────────────────────────────────────

const SAMPLE_DSL = `
flow:
  id: test-flow
  name: Login Test
  intent: Test login flow
  startUrl: http://localhost:3000/login
steps:
  - navigate: /login
  - type: Email = "user@example.com"
  - click: button("Sign In")
  - assert: urlContains("/dashboard")
`;

// ─── parseDsl ─────────────────────────────────────────────────────────────────

describe("parseDsl", () => {
  it("parses a minimal valid YAML spec", () => {
    const ast = parseDsl(SAMPLE_DSL);
    expect(ast.flow.id).toBe("test-flow");
    expect(ast.steps).toHaveLength(4);
    expect(ast.steps[0]).toMatchObject({ kind: "navigate", url: "/login" });
    expect(ast.steps[1]).toMatchObject({
      kind: "type",
      target: { role: "textbox", label: "Email" },
      value: "user@example.com",
    });
    expect(ast.steps[2]).toMatchObject({
      kind: "click",
      target: { role: "button", label: "Sign In" },
    });
    expect(ast.steps[3]).toMatchObject({
      kind: "assert",
      assertType: "urlContains",
      value: "/dashboard",
    });
  });

  it("throws on missing flow.id", () => {
    const bad = `
flow:
  name: Login Test
  intent: i
  startUrl: http://localhost:3000
steps:
  - navigate: /
`;
    expect(() => parseDsl(bad)).toThrow(/flow\.id/);
  });

  it("parses type steps with field assignment syntax", () => {
    const dsl = `
flow:
  id: f1
  name: n
  intent: i
  startUrl: http://localhost:3000
steps:
  - type: Email = "test@example.com"
  - assert: urlContains("/ok")
`;
    const ast = parseDsl(dsl);
    const step = ast.steps[0];
    expect(step.kind).toBe("type");
    if (step.kind === "type") {
      expect(step.target.label).toBe("Email");
      expect(step.value).toBe("test@example.com");
    }
  });

  it("parses assert visible with a role expression", () => {
    const dsl = `
flow:
  id: f1
  name: n
  intent: i
  startUrl: http://localhost:3000
steps:
  - navigate: /
  - assert: visible(button("Logout"))
`;
    const ast = parseDsl(dsl);
    const assertStep = ast.steps[1];
    expect(assertStep.kind).toBe("assert");
    if (assertStep.kind === "assert" && assertStep.assertType === "visible") {
      expect(assertStep.target.role).toBe("button");
      expect(assertStep.target.label).toBe("Logout");
    }
  });

  it("parses all assert types without throwing", () => {
    const dsl = `
flow:
  id: f1
  name: n
  intent: i
  startUrl: http://localhost:3000
steps:
  - navigate: /
  - assert: urlContains("/dashboard")
  - assert: textContains("Welcome")
  - assert: visible(link("Home"))
  - assert: absent(button("Sign In"))
  - assert: value(textbox("Email"), "user@example.com")
`;
    expect(() => parseDsl(dsl)).not.toThrow();
  });
});

// ─── compileDsl ───────────────────────────────────────────────────────────────

describe("compileDsl", () => {
  it("produces a valid SpecIR that passes lintSpec", () => {
    const ast = parseDsl(SAMPLE_DSL);
    const spec = compileDsl(ast);
    // Must parse as SpecIR without throwing
    expect(() => SpecIR.parse(spec)).not.toThrow();
    const lint = lintSpec(spec);
    expect(lint.ok).toBe(true);
  });

  it("attaches trailing assertions to the preceding step", () => {
    const ast = parseDsl(SAMPLE_DSL);
    const spec = compileDsl(ast);
    // The assert: urlContains line follows the click step → should be on it
    const clickStep = spec.steps.find(
      (s) => s.kind === "ui" && s.action === "click",
    );
    expect(clickStep?.assertions).toHaveLength(1);
    expect(clickStep?.assertions[0]).toMatchObject({
      type: "urlContains",
      expected: "/dashboard",
    });
  });

  it("populates semantics for every UI target", () => {
    const ast = parseDsl(SAMPLE_DSL);
    const spec = compileDsl(ast);
    for (const step of spec.steps) {
      if (step.kind === "ui" && step.target) {
        expect(step.target.semantics.length).toBeGreaterThan(0);
      }
    }
  });

  it("throws when spec has no assertion at all", () => {
    const noAssert = `
flow:
  id: f1
  name: n
  intent: i
  startUrl: http://localhost:3000
steps:
  - navigate: /
  - click: button("Sign In")
`;
    const ast = parseDsl(noAssert);
    expect(() => compileDsl(ast)).toThrow(/no assertion/i);
  });

  it("assigns sequential step IDs (step-1, step-2, ...)", () => {
    const ast = parseDsl(SAMPLE_DSL);
    const spec = compileDsl(ast);
    // 3 non-assert steps: navigate, type, click
    const ids = spec.steps.map((s) => s.id);
    expect(ids).toEqual(["step-1", "step-2", "step-3"]);
  });
});

// ─── decompileSpec ────────────────────────────────────────────────────────────

describe("decompileSpec", () => {
  it("round-trips: parseDsl → compileDsl → decompileSpec → parseDsl → compileDsl produces same step count and action types", () => {
    const ast1 = parseDsl(SAMPLE_DSL);
    const spec1 = compileDsl(ast1);
    const dsl2 = decompileSpec(spec1);
    const ast2 = parseDsl(dsl2);
    const spec2 = compileDsl(ast2);

    expect(spec2.steps).toHaveLength(spec1.steps.length);
    for (let i = 0; i < spec1.steps.length; i++) {
      expect(spec2.steps[i].kind).toBe(spec1.steps[i].kind);
      if (spec1.steps[i].kind === "ui") {
        expect((spec2.steps[i] as UiStep).action).toBe(
          (spec1.steps[i] as UiStep).action,
        );
      }
    }
  });

  it("emits flow metadata in the output", () => {
    const ast = parseDsl(SAMPLE_DSL);
    const spec = compileDsl(ast);
    const dsl = decompileSpec(spec);
    expect(dsl).toContain("id: test-flow");
    expect(dsl).toContain("startUrl: http://localhost:3000/login");
  });

  it("emits inline assert lines after the step that owns them", () => {
    const ast = parseDsl(SAMPLE_DSL);
    const spec = compileDsl(ast);
    const dsl = decompileSpec(spec);
    // The click step is followed by an assert urlContains line
    expect(dsl).toContain('assert: urlContains("/dashboard")');
  });

  it("round-trips geometric assertions (rightOf, inside, etc.)", () => {
    const dsl = `
flow:
  id: geo-flow
  name: Geometric Flow
  intent: Verify spatial relationships
  startUrl: http://localhost:3000
steps:
  - click: button("OK")
  - assert: rightOf(button("Cancel"))
  - assert: inside(section("Dialog"))
  - assert: below(textbox("Username"))
`;
    const ast = parseDsl(dsl);
    expect(ast.steps).toHaveLength(4);
    const spec = compileDsl(ast);
    expect(spec.steps).toHaveLength(1);
    const clickStep = spec.steps[0] as UiStep;
    expect(clickStep.assertions).toHaveLength(3);
    expect(clickStep.assertions[0]).toEqual({
      type: "isRightOf",
      referenceTarget: expect.objectContaining({
        role: "button",
        label: "Cancel",
      }),
    });
    expect(clickStep.assertions[1]).toEqual({
      type: "isInside",
      referenceTarget: expect.objectContaining({
        role: "section",
        label: "Dialog",
      }),
    });
    expect(clickStep.assertions[2]).toEqual({
      type: "isBelow",
      referenceTarget: expect.objectContaining({
        role: "textbox",
        label: "Username",
      }),
    });

    const decompiled = decompileSpec(spec);
    expect(decompiled).toContain('assert: rightOf(button("Cancel"))');
    expect(decompiled).toContain('assert: inside(section("Dialog"))');
    expect(decompiled).toContain('assert: below(textbox("Username"))');
  });
});
