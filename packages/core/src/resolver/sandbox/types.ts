import type { Tier1Target, Band, Generalization } from "@gimbal/shared";
import type { Page } from "playwright";

export interface SandboxCase {
  id: string;
  name: string;
  description: string;
  target: Tier1Target;
  html: string;
  expectedWinnerId: string | null;
  expectedBand: Band;
  generalization?: Generalization;
  /**
   * Free-form labels for filtering/reporting, e.g. ["react","form","known-gap"].
   * "known-gap" marks cases documenting a capability that does not exist yet —
   * expectedWinnerId/expectedBand record the CORRECT real-world answer, not
   * today's actual (wrong) resolver output. Optional; treat as `tags ?? []`
   * at every consumption site so existing cases don't need edits.
   */
  tags?: string[];
  /** Whether the fixture models a clean or messy/production-like DOM. */
  difficulty?: "clean" | "dirty";
  /**
   * Optional HTML served at /case/frame. When set, `html` is expected to embed
   * `<iframe src="/case/frame">` itself so the target can live inside the frame.
   */
  frameHtml?: string;
  /**
   * Optional setup hook run after page.goto() and before reground(), e.g. to
   * scroll a virtualized list container into a state where the target row exists.
   */
  preAction?: (page: Page) => Promise<void>;
}
