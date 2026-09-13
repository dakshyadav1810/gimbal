import {
  type Assertion,
  type SpecIR,
  type Tier1Target,
  type UiStep,
  lintSpec,
} from "@gimbal/shared";
import { type DslAst, type DslStep, type DslTarget } from "./parser.js";

// ─── Synonym table ────────────────────────────────────────────────────────────

const SYNONYMS: Record<string, string[]> = {
  email: ["email", "e-mail", "email address"],
  password: ["password", "passcode", "secret"],
  username: ["username", "user name", "login name"],
  search: ["search", "find", "query"],
  submit: ["submit", "send", "confirm"],
  save: ["save", "store", "persist"],
  login: ["login", "sign in", "log in", "authenticate"],
  name: ["name", "full name", "display name"],
  phone: ["phone", "telephone", "mobile"],
  address: ["address", "street address", "location"],
};

function expandSemantics(label: string): string[] {
  const lower = label.toLowerCase();
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (lower.includes(key)) return syns;
  }
  return [lower];
}

// ─── Action → actions array ──────────────────────────────────────────────────

const ACTION_VERBS: Record<string, string[]> = {
  click: ["click", "press", "activate"],
  type: ["type", "fill", "enter", "input"],
  select: ["select", "choose", "pick"],
  submit: ["submit", "press enter"],
  keypress: ["press", "keypress"],
  waitForSelector: ["appear", "load", "render"],
};

// ─── Role normalisation ──────────────────────────────────────────────────────
// Map DSL role aliases to valid AriaRole values used in the IR.

const ROLE_MAP: Record<string, string> = {
  button: "button",
  textbox: "textbox",
  combobox: "combobox",
  link: "link",
  checkbox: "checkbox",
  radio: "radio",
  tab: "tab",
  menuitem: "menuitem",
  listbox: "listbox",
  option: "option",
  switch: "switch",
  searchbox: "searchbox",
};

function normaliseRole(role: string): string {
  return ROLE_MAP[role.toLowerCase()] ?? role.toLowerCase();
}

// ─── Target builder ──────────────────────────────────────────────────────────

function buildTier1Target(
  dslTarget: DslTarget,
  stepKind: string,
): Tier1Target {
  return {
    label: dslTarget.label,
    role: normaliseRole(dslTarget.role) as Tier1Target["role"],
    semantics: expandSemantics(dslTarget.label),
    actions: ACTION_VERBS[stepKind] ?? ["interact"],
    intent: `${stepKind} ${dslTarget.label}`,
  };
}

// ─── Assertion builder ───────────────────────────────────────────────────────

function buildAssertion(step: DslStep & { kind: "assert" }): Assertion {
  switch (step.assertType) {
    case "urlContains":
      return { type: "urlContains", expected: step.value };
    case "textContains":
      return { type: "textContains", expected: step.value };
    case "visible":
      return {
        type: "elementVisible",
        target: buildTier1Target(step.target, "assert"),
      };
    case "absent":
      return {
        type: "elementAbsent",
        target: buildTier1Target(step.target, "assert"),
      };
    case "value":
      return {
        type: "value",
        expected: step.expected,
        target: buildTier1Target(step.target, "assert"),
      };
    case "geometric":
      return {
        type: step.geometricType,
        referenceTarget: buildTier1Target(step.referenceTarget, "assert"),
        ...(step.target ? { target: buildTier1Target(step.target, "assert") } : {}),
      };
  }
}

// ─── Compiler ────────────────────────────────────────────────────────────────

export function compileDsl(ast: DslAst): SpecIR {
  const steps: SpecIR["steps"] = [];
  // Pending assertions to attach to the next non-assert step we flush.
  // The DSL convention: assert lines AFTER a step belong to that step.
  // So we attach pending asserts to the PREVIOUS non-assert step.
  let pendingAssertions: Assertion[] = [];
  let stepCounter = 0;

  const nextId = () => `step-${++stepCounter}`;

  // Flush pending assertions onto the last pushed step.
  const flushAssertions = () => {
    if (pendingAssertions.length === 0) return;
    const last = steps[steps.length - 1];
    if (last && last.kind === "ui") {
      (last as UiStep).assertions.push(...pendingAssertions);
    }
    pendingAssertions = [];
  };

  for (const dslStep of ast.steps) {
    if (dslStep.kind === "assert") {
      // Accumulate; will be attached once we see the next non-assert step flushed
      pendingAssertions.push(buildAssertion(dslStep));
      continue;
    }

    // Before we push a new action step, flush pending asserts onto the previous one.
    flushAssertions();

    const base = {
      id: nextId(),
      onFailure: "abort" as const,
      preconditions: [],
      assertions: [] as Assertion[],
      negative: false,
    };

    switch (dslStep.kind) {
      case "navigate":
        steps.push({
          ...base,
          kind: "ui",
          action: "navigate",
          intent: `navigate to ${dslStep.url}`,
          value: dslStep.url,
          generalization: "same_element",
          expectedOutcome: [],
        });
        break;

      case "wait":
        steps.push({
          ...base,
          kind: "ui",
          action: "wait",
          intent: `wait ${dslStep.ms}ms`,
          value: String(dslStep.ms),
          generalization: "same_element",
          expectedOutcome: [],
        });
        break;

      case "keypress":
        steps.push({
          ...base,
          kind: "ui",
          action: "keypress",
          intent: `press key ${dslStep.key}`,
          value: dslStep.key,
          generalization: "same_element",
          expectedOutcome: [],
        });
        break;

      case "click":
        steps.push({
          ...base,
          kind: "ui",
          action: "click",
          intent: `click ${dslStep.target.label}`,
          generalization: "same_element",
          expectedOutcome: [],
          target: buildTier1Target(dslStep.target, "click"),
        });
        break;

      case "type":
        steps.push({
          ...base,
          kind: "ui",
          action: "type",
          intent: `type into ${dslStep.target.label}`,
          value: dslStep.value,
          generalization: "same_element",
          expectedOutcome: [],
          target: buildTier1Target(dslStep.target, "type"),
        });
        break;

      case "select":
        steps.push({
          ...base,
          kind: "ui",
          action: "select",
          intent: `select ${dslStep.value} in ${dslStep.target.label}`,
          value: dslStep.value,
          generalization: "same_element",
          expectedOutcome: [],
          target: buildTier1Target(dslStep.target, "select"),
        });
        break;

      case "submit":
        steps.push({
          ...base,
          kind: "ui",
          action: "submit",
          intent: `submit via ${dslStep.target.label}`,
          generalization: "same_element",
          expectedOutcome: [],
          target: buildTier1Target(dslStep.target, "submit"),
        });
        break;

      case "waitForSelector":
        steps.push({
          ...base,
          kind: "ui",
          action: "waitForSelector",
          intent: `wait for ${dslStep.target.label} to appear`,
          generalization: "same_element",
          expectedOutcome: [],
          target: buildTier1Target(dslStep.target, "waitForSelector"),
        });
        break;
    }
  }

  // Flush any trailing assertions onto the last step.
  flushAssertions();

  const spec: SpecIR = {
    version: "1.0",
    flow: {
      id: ast.flow.id,
      name: ast.flow.name,
      intent: ast.flow.intent,
      startUrl: ast.flow.startUrl,
      vars: ast.flow.vars ?? {},
    },
    steps,
  };

  const lint = lintSpec(spec);
  if (!lint.ok) {
    throw new Error(`DSL spec failed lint:\n${lint.errors.join("\n")}`);
  }
  if (lint.warnings && lint.warnings.length > 0) {
    (spec as any).warnings = lint.warnings;
  }

  return spec;
}
