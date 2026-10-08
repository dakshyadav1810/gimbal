import { z } from "zod";
import { Score } from "./enums.js";

export const GimbalConfig = z.object({
  port: z.number().default(4319),
  browser: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  headless: z.boolean().default(true),
  dbPath: z.string().default(".gimbal/cache.db"),
  artifactsDir: z.string().default(".gimbal/tests"),
  screenshotsDir: z.string().default(".gimbal/screenshots"),
  fixturesDir: z.string().default(".gimbal/fixtures"),
  snapshotsDir: z.string().default(".gimbal/snapshots"),
  // ground: remember pages seen while grounding · always: also after runs · off: never store.
  snapshots: z.enum(["ground", "always", "off"]).default("ground"),
  // The running app, used by doctor and the demos.
  appUrl: z.string().url().optional(),
  embeddingModel: z.string().default("Xenova/all-MiniLM-L6-v2"),
  // Pinned model commit: resolver scores must be reproducible across machines and over time, so the
  // weights are never fetched from a moving branch.
  embeddingRevision: z
    .string()
    .default("751bff37182d3f1213fa05d7196b954e230abad9"),
  bands: z
    .object({ high: Score.default(0.7), medium: Score.default(0.5) })
    .refine((b) => b.high > b.medium, {
      message:
        "bands.high must be greater than bands.medium — a misconfigured ordering would silently invert confidence semantics",
      path: ["high"],
    })
    .default({}),
  timeouts: z
    .object({
      actionMs: z.number().default(15000),
      navMs: z.number().default(30000),
      // Promoted from hydration.ts's previously-hardcoded constants — defaults match the prior
      // behavior exactly, so this is opt-in-only unless a project overrides them.
      hydrationNetworkIdleMs: z.number().default(2000),
      hydrationQuietWindowMs: z.number().default(150),
    })
    .default({}),
  // Bounded scroll-and-re-extract passes when a virtualized/windowed container is detected during
  // extraction (dom-extractor.ts's insideVirtualizedContainer heuristic) — 0 disables scrolling.
  maxScrollPasses: z.number().int().min(0).default(3),
  // No `llm` block: Gimbal never calls a model provider. Authoring/maintenance happens entirely inside
  // the developer's own connected agent (Claude Code, Cursor, ...) via MCP — there is no API key here.
  db: z
    .object({ url: z.string().optional(), readOnly: z.boolean().default(true) })
    .default({}),
  // Determinism playbook (ADR/PLAN Phase 3): opt-in controls for the ~70%-of-E2E-failures class
  // (timing, state, network) the resolver can't touch by construction. All unset by default —
  // behavior-neutral until a project opts in. Grounding should never default to "replay" (it would
  // silently mask a real backend change during the capture that plants Tier-2 anchors).
  // propose: heal in-run, verify, record a repair for review · strict: heals must be verified or the
  // step fails · off: never heal at runtime, a missing selector is a stale step.
  healing: z
    .object({ mode: z.enum(["propose", "strict", "off"]).default("propose") })
    .default({}),
  determinism: z
    .object({
      fixedTime: z.string().datetime().optional(),
      harPath: z.string().optional(),
      harMode: z.enum(["record", "replay"]).optional(),
      storageStatePath: z.string().optional(),
    })
    .default({}),
});
export type GimbalConfig = z.infer<typeof GimbalConfig>;
