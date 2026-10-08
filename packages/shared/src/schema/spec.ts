import { z } from "zod";
import { Step } from "./step.js";

// spec.json — versioned, DOM-blind (LLD-001 §4)
export const SpecIR = z.object({
  version: z.literal("1.0"),
  flow: z.object({
    id: z.string(),
    name: z.string(),
    intent: z.string(),
    startUrl: z.string().url(),
    // declared var NAMES + optional non-secret defaults; secret values arrive via RunRequest.vars
    vars: z.record(z.string()).default({}),
  }),
  steps: z.array(Step).min(1),
});
export type SpecIR = z.infer<typeof SpecIR>;

// spec lint (LLD-002 §5): every ${var} used must exist in flow.vars; actuating UI steps need a target;
// wait/navigate must not have one; at least one assertion/expectedOutcome across the spec;
// warn on trivial urlContains assertions that already match active URL without element checks.
export function lintSpec(spec: SpecIR): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const varNames = new Set(Object.keys(spec.flow.vars));
  const varRefRe = /\$\{(\w+)\}/g;
  let hasAssertion = false;
  let currentKnownUrl = spec.flow.startUrl;

  for (const step of spec.steps) {
    const text = JSON.stringify(step);
    for (const m of text.matchAll(varRefRe)) {
      if (!varNames.has(m[1]))
        errors.push(`step ${step.id}: unresolved var \${${m[1]}}`);
    }
    if (step.assertions.length > 0) hasAssertion = true;
    if (step.kind === "ui") {
      if ("expectedOutcome" in step && step.expectedOutcome.length > 0)
        hasAssertion = true;
      const actuating = [
        "click",
        "type",
        "select",
        "keypress",
        "submit",
      ].includes(step.action);
      if (actuating && !step.target)
        errors.push(`step ${step.id}: actuating action requires a target`);
      if (!actuating && step.target)
        errors.push(`step ${step.id}: wait/navigate must not have a target`);

      if (step.action === "navigate" && step.value) {
        currentKnownUrl = step.value;
      }

      // Check for trivial urlContains assertions
      for (const a of step.assertions) {
        if (a.type === "urlContains") {
          const expected = a.expected;
          const isTrivial = currentKnownUrl.includes(expected);
          const hasOtherChecks =
            step.assertions.length > 1 ||
            ("expectedOutcome" in step && step.expectedOutcome.length > 0);
          if (isTrivial && !hasOtherChecks && step.action !== "navigate") {
            warnings.push(
              `step ${step.id}: urlContains("${expected}") is already satisfied by current URL ("${currentKnownUrl}") without verifying element or DOM state changes`,
            );
          }
        }
      }
    }
  }
  // A click/submit with nothing checking its result can't be told apart from a click on the wrong
  // element after a runtime heal. Checking in the step itself or the one right after is enough.
  const checks = (st: SpecIR["steps"][number] | undefined) =>
    st !== undefined &&
    (st.assertions.length > 0 ||
      (st.kind === "ui" && st.expectedOutcome.length > 0));
  spec.steps.forEach((st, i) => {
    if (st.kind !== "ui" || !["click", "submit"].includes(st.action)) return;
    if (!checks(st) && !checks(spec.steps[i + 1]))
      warnings.push(
        `step ${st.id}: ${st.action} has no expectedOutcome or assertion on it or the next step; a wrong element chosen at runtime would go unnoticed`,
      );
  });
  if (!hasAssertion)
    errors.push("spec has no assertion or expectedOutcome across any step");
  return { ok: errors.length === 0, errors, warnings };
}
