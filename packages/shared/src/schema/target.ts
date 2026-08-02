import { z } from "zod";
import { AriaRole } from "./enums.js";

// DOM-blind — what the LLM authors (LLD-001 §2). role is constrained to Playwright's getByRole()
// ARIA role set so an invalid guess ("card", "notification") fails schema validation up front,
// instead of silently never matching anything at grounding/runtime.
export const Tier1Target = z.object({
  label: z.string(),
  semantics: z.array(z.string()).min(1),
  role: AriaRole,
  actions: z.array(z.string()).default([]),
  intent: z.string(),
});
export type Tier1Target = z.infer<typeof Tier1Target>;
