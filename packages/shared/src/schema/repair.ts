import { z } from "zod";
import { Band } from "./enums.js";

// Where an element was found: enough to show a reviewer, never DOM contents or typed values.
export const RepairLocation = z.object({
  selector: z.string(),
  label: z.string().optional(),
  role: z.string().optional(),
  region: z.enum(["form", "modal", "section"]).nullable().optional(),
  contextPath: z.array(z.string()).optional(),
  frame: z.object({ url: z.string(), index: z.number() }).optional(),
});
export type RepairLocation = z.infer<typeof RepairLocation>;

// repairs.json entry: the durable, reviewable record of one change (or one abstention) for a step.
export const Repair = z.object({
  id: z.string(),
  testId: z.string(),
  stepId: z.string(),
  // heal: runtime proposal · needed: the step was stale and nothing was found · patch: agent-submitted
  kind: z.enum(["heal", "needed", "patch"]),
  status: z.enum(["proposed", "needed", "accepted", "rejected", "superseded"]),
  createdAt: z.string(),
  decidedAt: z.string().optional(),
  runId: z.string().optional(),
  before: RepairLocation,
  after: RepairLocation.optional(),
  evidence: z
    .object({
      confidence: z.number(),
      band: Band,
      signals: z.record(z.number()),
      runnerUp: z
        .object({ label: z.string().optional(), score: z.number() })
        .optional(),
    })
    .optional(),
  verification: z
    .object({
      level: z.enum(["outcome", "effect", "none"]),
      result: z.enum(["verified", "mismatch", "inconclusive"]),
      detail: z.string().optional(),
    })
    .optional(),
  reason: z.string().optional(),
});
export type Repair = z.infer<typeof Repair>;

export const RepairsDoc = z.object({
  version: z.literal("1.0"),
  repairs: z.array(Repair),
});
export type RepairsDoc = z.infer<typeof RepairsDoc>;
