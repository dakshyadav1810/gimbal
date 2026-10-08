import { z } from "zod";
import { GroundedResolution } from "./resolution.js";
import { SpecIR } from "./spec.js";
import { ApiStep, DbStep, UiStep } from "./step.js";
import { Tier1Target } from "./target.js";

// resolution optional: steps past the first ungrounded step are never reached (LLD-003 ACT-to-advance)
export const GroundedTarget = Tier1Target.extend({
  resolution: GroundedResolution.optional(),
});
export type GroundedTarget = z.infer<typeof GroundedTarget>;

// What acting on this step changed at grounding time (URL path, elements that appeared or went
// away). Used to sanity-check a runtime heal when the author wrote no outcome for the step.
export const EffectFingerprint = z.object({
  urlPathChanged: z.boolean(),
  toPath: z.string().optional(),
  appeared: z.array(z.string()).default([]),
  disappeared: z.array(z.string()).default([]),
});
export type EffectFingerprint = z.infer<typeof EffectFingerprint>;

export const GroundedUiStep = UiStep.omit({ target: true }).extend({
  target: GroundedTarget.optional(),
  effect: EffectFingerprint.optional(),
});
export type GroundedUiStep = z.infer<typeof GroundedUiStep>;

export const GroundedStep = z.discriminatedUnion("kind", [
  GroundedUiStep,
  ApiStep,
  DbStep,
]);
export type GroundedStep = z.infer<typeof GroundedStep>;

export const GroundedTest = SpecIR.omit({ steps: true }).extend({
  groundedAt: z.string(),
  groundedUrl: z.string().url(),
  // Embedding model the scores were produced with; a run under a different one is refused so
  // confidence bands from two models are never mixed.
  resolver: z.object({ model: z.string(), revision: z.string() }).optional(),
  steps: z.array(GroundedStep),
});
export type GroundedTest = z.infer<typeof GroundedTest>;

export function isStepGrounded(step: GroundedStep): boolean {
  return step.kind === "ui" && step.target?.resolution?.status === "grounded";
}
