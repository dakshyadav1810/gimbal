import { z } from "zod";

// What an agent may know about a page before authoring against it. Deliberately shallow: no input
// values, no URL query or hash, no ARIA text. See core/src/snapshots.
export const PageSnapshot = z.object({
  version: z.literal("1.0"),
  url: z.string(), // origin + path
  capturedAt: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }).nullable(),
  source: z.enum(["ground", "run", "explore", "refresh"]),
  // True when the browser that observed this page loaded a saved login (determinism.storageStatePath).
  authenticated: z.boolean(),
  domHash: z.string(),
  title: z.string(),
  elements: z.array(
    z.object({
      role: z.string(),
      name: z.string(),
      region: z.enum(["form", "modal", "section"]).nullable().optional(),
      testId: z.string().optional(),
      state: z.object({ disabled: z.boolean().optional() }).optional(),
      path: z.array(z.string()),
    }),
  ),
});
export type PageSnapshot = z.infer<typeof PageSnapshot>;

export const GetPageResponse = z.object({
  snapshot: PageSnapshot,
  ageSeconds: z.number(),
  // Plain-language reminder an agent can't miss: this is one observation, not the whole app.
  note: z.string(),
});
export type GetPageResponse = z.infer<typeof GetPageResponse>;
