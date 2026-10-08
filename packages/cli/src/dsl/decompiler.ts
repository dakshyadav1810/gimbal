import type { ApiStep, DbStep, SpecIR, UiStep } from "@gimbal/shared";
import { stringify } from "yaml";

// Converts a Tier1Target role + label back into a DSL target expression.
function targetExpr(role: string, label: string): string {
  return `${role}("${label}")`;
}

// Converts a single UiStep to one or more DSL lines.
function uiStepLines(step: UiStep): string[] {
  const lines: string[] = [];

  switch (step.action) {
    case "navigate":
      lines.push(`navigate: ${step.value ?? ""}`);
      break;
    case "wait":
      lines.push(`wait: ${step.value ?? "500"}`);
      break;
    case "keypress":
      lines.push(`keypress: ${step.value ?? ""}`);
      break;
    case "click":
      if (step.target)
        lines.push(`click: ${targetExpr(step.target.role, step.target.label)}`);
      break;
    case "type":
      if (step.target)
        lines.push(`type: ${step.target.label} = "${step.value ?? ""}"`);
      break;
    case "select":
      if (step.target)
        lines.push(`select: ${step.target.label} = "${step.value ?? ""}"`);
      break;
    case "submit":
      if (step.target)
        lines.push(
          `submit: ${targetExpr(step.target.role, step.target.label)}`,
        );
      break;
    case "waitForSelector":
      if (step.target)
        lines.push(
          `waitForSelector: ${targetExpr(step.target.role, step.target.label)}`,
        );
      break;
  }

  // Inline assertions follow the step.
  for (const a of step.assertions) {
    switch (a.type) {
      case "urlContains":
        lines.push(`assert: urlContains("${a.expected}")`);
        break;
      case "textContains":
        lines.push(`assert: textContains("${a.expected}")`);
        break;
      case "elementVisible":
        lines.push(
          `assert: visible(${targetExpr(a.target.role, a.target.label)})`,
        );
        break;
      case "elementAbsent":
        lines.push(
          `assert: absent(${targetExpr(a.target.role, a.target.label)})`,
        );
        break;
      case "value":
        if (a.target)
          lines.push(
            `assert: value(${targetExpr(a.target.role, a.target.label)}, "${a.expected}")`,
          );
        break;
      case "isRightOf":
        lines.push(
          `assert: rightOf(${targetExpr(a.referenceTarget.role, a.referenceTarget.label)})`,
        );
        break;
      case "isLeftOf":
        lines.push(
          `assert: leftOf(${targetExpr(a.referenceTarget.role, a.referenceTarget.label)})`,
        );
        break;
      case "isAbove":
        lines.push(
          `assert: above(${targetExpr(a.referenceTarget.role, a.referenceTarget.label)})`,
        );
        break;
      case "isBelow":
        lines.push(
          `assert: below(${targetExpr(a.referenceTarget.role, a.referenceTarget.label)})`,
        );
        break;
      case "isInside":
        lines.push(
          `assert: inside(${targetExpr(a.referenceTarget.role, a.referenceTarget.label)})`,
        );
        break;
      case "isAlignedHorizontally":
        lines.push(
          `assert: alignedHorizontally(${targetExpr(a.referenceTarget.role, a.referenceTarget.label)})`,
        );
        break;
      case "isAlignedVertically":
        lines.push(
          `assert: alignedVertically(${targetExpr(a.referenceTarget.role, a.referenceTarget.label)})`,
        );
        break;
    }
  }

  return lines;
}

// Converts a single ApiStep to a YAML comment block.
function apiStepLines(step: ApiStep): string[] {
  return [
    `# api step: ${step.id} — ${step.request.method} ${step.request.url}`,
  ];
}

// Converts a single DbStep to a YAML comment block.
function dbStepLines(step: DbStep): string[] {
  return [`# db step: ${step.id} — ${step.query}`];
}

// ─── Main decompiler ─────────────────────────────────────────────────────────

export function decompileSpec(spec: SpecIR): string {
  const stepLines: string[] = [];

  for (const step of spec.steps) {
    if (step.kind === "ui") {
      stepLines.push(...uiStepLines(step));
    } else if (step.kind === "api") {
      stepLines.push(...apiStepLines(step));
    } else {
      stepLines.push(...dbStepLines(step));
    }
  }

  // Build a plain object and let the `yaml` package stringify it cleanly.
  const doc = {
    flow: {
      id: spec.flow.id,
      name: spec.flow.name,
      intent: spec.flow.intent,
      startUrl: spec.flow.startUrl,
      ...(Object.keys(spec.flow.vars ?? {}).length > 0
        ? { vars: spec.flow.vars }
        : {}),
    },
    // steps is a list of single-key objects; we represent them as literal
    // YAML mapping scalars joined by newlines inside a block-scalar string,
    // but the cleanest approach is to emit them as raw YAML lines manually.
  };

  const header = stringify(doc, { lineWidth: 0 }).trimEnd();

  // Emit steps as literal lines — the yaml package would nest the step objects
  // in a way that loses the concise one-liner DSL style.
  const stepsBlock =
    stepLines.length > 0
      ? `steps:\n${stepLines.map((l) => `  - ${l}`).join("\n")}`
      : "steps: []";

  return `${header}\n${stepsBlock}\n`;
}
