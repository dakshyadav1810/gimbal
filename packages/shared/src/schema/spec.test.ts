import { describe, expect, it } from "vitest";
import { GroundedTest } from "./groundedTest.js";
import { lintSpec } from "./spec.js";
import { SpecIR } from "./spec.js";
import type { UiStep } from "./step.js";

const spec: SpecIR = {
  version: "1.0",
  flow: {
    id: "f1",
    name: "login",
    intent: "test login",
    startUrl: "https://app.local",
    vars: { email: "" },
  },
  steps: [
    {
      id: "s1",
      kind: "ui",
      intent: "Enter the user's email address.",
      action: "type",
      value: "${email}",
      generalization: "same_element",
      onFailure: "retry_once",
      preconditions: [{ kind: "visible" }, { kind: "enabled" }],
      expectedOutcome: [{ type: "field_contains", value: "${email}" }],
      assertions: [{ type: "value", expected: "${email}" }],
      negative: false,
      target: {
        label: "Email",
        role: "textbox",
        intent: "Primary email input",
        semantics: ["email", "login", "credential"],
        actions: ["type", "focus"],
      },
    },
  ],
};

describe("SpecIR", () => {
  it("parses and lints clean", () => {
    const parsed = SpecIR.parse(spec);
    expect(lintSpec(parsed).ok).toBe(true);
  });

  it("flags unresolved vars", () => {
    const bad = { ...spec, flow: { ...spec.flow, vars: {} } };
    expect(lintSpec(SpecIR.parse(bad)).ok).toBe(false);
  });

  it("warns on trivial urlContains assertion matching already active URL", () => {
    const trivial: SpecIR = {
      ...spec,
      steps: [
        {
          id: "s1",
          kind: "ui",
          action: "click",
          intent: "click next",
          onFailure: "abort",
          preconditions: [],
          expectedOutcome: [],
          assertions: [{ type: "urlContains", expected: "app.local" }],
          negative: false,
          generalization: "same_element",
          target: {
            label: "Next",
            role: "button",
            semantics: ["next"],
            actions: ["click"],
            intent: "next",
          },
        },
      ],
    };
    const result = lintSpec(trivial);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("already satisfied by current URL");
  });
});

describe("GroundedTest", () => {
  it("validates a partially-grounded test (later step has no resolution)", () => {
    const grounded: GroundedTest = {
      ...spec,
      groundedAt: new Date(0).toISOString(),
      groundedUrl: spec.flow.startUrl,
      steps: [
        {
          ...(spec.steps[0] as UiStep),
          target: {
            ...(spec.steps[0] as UiStep).target!,
            resolution: {
              status: "grounded",
              confidence: 0.92,
              band: "high",
              selected: "cand_2",
              cachedSelector: "input[type='email']",
              winner: {
                id: "cand_2",
                selector: "input[type='email']",
                anchors: {},
                signals: {
                  semantics: 0.98,
                  affordance: 1,
                  context: 0.84,
                  structure: 0.91,
                  index: 0.5,
                },
                score: 0.92,
                band: "high",
              },
            },
          },
        },
      ],
    };
    expect(() => GroundedTest.parse(grounded)).not.toThrow();
  });
});

describe("lintSpec — unchecked click", () => {
  const base = (steps: unknown[]) =>
    SpecIR.parse({
      version: "1.0",
      flow: { id: "f", name: "f", intent: "i", startUrl: "http://localhost/", vars: {} },
      steps,
    });
  const click = (id: string, extra = {}) => ({
    id,
    kind: "ui",
    action: "click",
    intent: "go",
    target: { label: "Go", role: "button", semantics: ["go"], actions: ["click"], intent: "go" },
    ...extra,
  });
  const wait = { id: "w", kind: "ui", action: "wait", intent: "w", assertions: [{ type: "textContains", expected: "ok" }] };

  it("warns when nothing checks the click", () => {
    const r = lintSpec(base([click("b", { assertions: [{ type: "textContains", expected: "ok" }] }), click("a")]));
    expect(r.warnings.some((w) => w.includes("step a"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("step b"))).toBe(false);
  });

  it("is satisfied by an assertion on the next step", () => {
    const r = lintSpec(base([click("a"), wait]));
    expect(r.warnings.filter((w) => w.includes("step a"))).toEqual([]);
  });
});
