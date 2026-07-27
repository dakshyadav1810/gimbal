import { z } from "zod";
import { Score } from "./enums.js";

export const GimbalConfig = z.object({
  port: z.number().default(4319),
  browser: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  headless: z.boolean().default(true),
  dbPath: z.string().default(".gimbal/cache.db"),
  artifactsDir: z.string().default(".gimbal/tests"),
  screenshotsDir: z.string().default(".gimbal/screenshots"),
  embeddingModel: z.string().default("Xenova/all-MiniLM-L6-v2"),
  bands: z
    .object({ high: Score.default(0.7), medium: Score.default(0.5) })
    .default({}),
  timeouts: z
    .object({
      actionMs: z.number().default(15000),
      navMs: z.number().default(30000),
    })
    .default({}),
  // No `llm` block: Gimbal never calls a model provider. Authoring/maintenance happens entirely inside
  // the developer's own connected agent (Claude Code, Cursor, ...) via MCP — there is no API key here.
  db: z
    .object({ url: z.string().optional(), readOnly: z.boolean().default(true) })
    .default({}),
});
export type GimbalConfig = z.infer<typeof GimbalConfig>;
