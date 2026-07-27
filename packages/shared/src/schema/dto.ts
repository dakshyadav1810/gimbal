import { z } from "zod";
import { Band } from "./enums.js";
import { SpecIR } from "./spec.js";
import { GroundedTest } from "./groundedTest.js";

// No AuthorRequest: Gimbal never calls an LLM provider. The connected agent authors the SpecIR entirely
// in its own session and calls submitSpec with the finished spec.

export const GroundRequest = z.object({ specId: z.string() });
export type GroundRequest = z.infer<typeof GroundRequest>;

export const RunRequest = z.object({ testId: z.string(), vars: z.record(z.string()).optional() });
export type RunRequest = z.infer<typeof RunRequest>;

// `spec` is required: the agent always supplies the repaired SpecIR. No core-side generation fallback.
export const MaintainRequest = z.object({ stepIds: z.array(z.string()), spec: SpecIR });
export type MaintainRequest = z.infer<typeof MaintainRequest>;

export const StepResult = z.object({
  stepId: z.string(),
  status: z.enum(["passed", "failed", "warning", "skipped", "stale"]),
  selection: z.enum(["cached", "resolver", "none"]).optional(),
  band: Band.optional(),
  failure: z.object({ reason: z.string(), message: z.string() }).optional(),
  durationMs: z.number(),
  screenshot: z.string().optional(),
});
export type StepResult = z.infer<typeof StepResult>;

export const RunReport = z.object({
  runId: z.string(),
  testId: z.string(),
  status: z.enum(["passed", "failed"]),
  needsReview: z.boolean().default(false),
  steps: z.array(StepResult),
  startedAt: z.string(),
  finishedAt: z.string(),
});
export type RunReport = z.infer<typeof RunReport>;

// No "provider_error" — core never calls a provider, so nothing there can fail.
export const ApiError = z.object({
  error: z.object({
    code: z.enum(["validation", "not_found", "ungrounded", "stale", "browser_error"]),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const RepairPayload = z.object({
  specIR: SpecIR,
  testCase: GroundedTest,
  kdg: z.unknown(), // KDG data structure deferred (ADR-002 out-of-scope)
});
export type RepairPayload = z.infer<typeof RepairPayload>;

// LLD-010 §2.1: thin projection of RunReport for the run-history list — no steps[] body.
export const RunSummary = RunReport.omit({ steps: true });
export type RunSummary = z.infer<typeof RunSummary>;

// LLD-010 §2.2 / §4: the REST-facing twin of the ReviewRecord interface in
// packages/core/src/cache/index.ts — that interface remains CacheStore's internal storage contract;
// this is the one API-facing definition the dashboard and core routes both import.
export const ReviewRecord = z.object({
  testId: z.string(),
  stepId: z.string(),
  url: z.string(),
  screenshotPath: z.string().optional(),
  candidatesJson: z.string().optional(),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;
