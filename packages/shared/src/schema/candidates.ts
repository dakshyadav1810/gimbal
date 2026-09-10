import { z } from "zod";
import { Band, Score } from "./enums.js";

export const BoundingBox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBox>;

export const SignalScores = z.object({
  semantics: Score,
  affordance: Score,
  context: Score,
  structure: Score,
  index: Score,
});
export type SignalScores = z.infer<typeof SignalScores>;

// one considered DOM element (grounding-captured, persisted subset) — LLD-001 §5
export const Candidate = z.object({
  id: z.string(),
  selector: z.string(),
  label: z.string().optional(),
  role: z.string().optional(),
  boundingBox: BoundingBox.optional(),
  anchors: z
    .object({
      testId: z.string().optional(),
      attributes: z.record(z.string()).default({}),
      xpath: z.string().optional(),
      contextPath: z.array(z.string()).default([]),
      siblingIndex: z.number().optional(),
      nearbyText: z.string().optional(),
      controlledContent: z.string().optional(),
    })
    .partial()
    .default({}),
  signals: SignalScores,
  score: Score,
  band: Band,
  // Enclosing landmark container at grounding time (mirrors resolver/base.ts's DomCandidate) —
  // used by healing/runtime.ts to block a heal from leaking outside an open modal. Must survive
  // the save/load round-trip through this schema, unlike DomCandidate's other resolver-internal
  // fields, since the cross-container drift guard runs against the persisted GroundedTest.
  region: z.enum(["form", "modal", "section"]).nullable().optional(),
  // Set when this candidate came from a same-origin/cross-origin child iframe rather than the
  // main frame — must survive save/load like `region` above so a heal can still target it.
  frame: z.object({ url: z.string(), index: z.number() }).optional(),
});
export type Candidate = z.infer<typeof Candidate>;
