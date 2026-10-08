import { randomUUID } from "node:crypto";
import type {
  GimbalConfig,
  GroundedTest,
  RunReport,
  StepResult,
  WsMessage,
} from "@gimbal/shared";
import type { CacheStore } from "../cache/index.js";
import type { CachedEmbedder } from "../resolver/embeddings.js";
import type { HealingService } from "../healing/index.js";
import { ApiAdapter } from "./adapters/api.js";
import { DbAdapter } from "./adapters/db.js";
import { UiAdapter } from "./adapters/ui.js";
import { openDbSession } from "./db-client.js";
import { openSession } from "./playwright.js";
import type { RunContext, StepAdapter } from "./types.js";
import { aggregate } from "./verdict.js";
import { hydrationTimeoutsFrom, waitForPageHydration } from "./hydration.js";

export interface TestRunner {
  run(
    test: GroundedTest,
    opts: {
      testId: string;
      vars?: Record<string, string>;
      emit?: (m: WsMessage) => void;
      runId?: string;
    },
  ): Promise<RunReport>;
}

function isFatal(onFailure: string, result: StepResult): boolean {
  return result.status === "failed" && onFailure === "abort";
}

export class PlaywrightTestRunner implements TestRunner {
  private adapters: Record<string, StepAdapter> = {
    ui: new UiAdapter(),
    api: new ApiAdapter(),
    db: new DbAdapter(),
  };

  constructor(
    private config: GimbalConfig,
    private cache: CacheStore,
    private healing: HealingService,
    private embedder: CachedEmbedder,
  ) {}

  async run(
    test: GroundedTest,
    opts: {
      testId: string;
      vars?: Record<string, string>;
      emit?: (m: WsMessage) => void;
      runId?: string;
    },
  ): Promise<RunReport> {
    const runId = opts.runId ?? randomUUID();
    const startedAt = new Date().toISOString();
    const session = await openSession(this.config);
    const dbSession = openDbSession(this.config);
    if (dbSession) await dbSession.beginFixture();
    const ctx: RunContext = {
      test,
      testId: opts.testId,
      page: session.page,
      context: session.context,
      vars: { ...test.flow.vars, ...(opts.vars ?? {}) },
      cache: this.cache,
      healing: this.healing,
      embedder: this.embedder,
      config: this.config,
      dbQuery: dbSession?.query.bind(dbSession),
      runId,
      screenshotsDir: this.config.screenshotsDir,
    };
    const results: StepResult[] = [];

    // Placeholder row so GET /runs/:id can tell "still running" apart from "never existed" while
    // this executes — without it, polling during the run is indistinguishable from a bad run id.
    this.cache.startRun(runId, opts.testId, startedAt);
    opts.emit?.({ type: "run.start", runId, testId: opts.testId });
    try {
      await session.page.goto(test.groundedUrl, {
        waitUntil: "domcontentloaded",
      });
      await waitForPageHydration(
        session.page,
        undefined,
        hydrationTimeoutsFrom(this.config),
      );
      for (const step of test.steps) {
        opts.emit?.({ type: "step.start", stepId: step.id });
        let result = await this.adapters[step.kind].execute(step, ctx);
        if (result.status === "failed" && step.onFailure === "retry_once") {
          result = await this.adapters[step.kind].execute(step, ctx);
        }
        if (result.status === "failed" && step.onFailure === "optional")
          result = { ...result, status: "warning" };
        results.push(result);
        opts.emit?.({ type: "step.result", result });
        if (isFatal(step.onFailure, result)) break;
      }
    } catch (e) {
      this.cache.failRun(runId, new Date().toISOString());
      throw e;
    } finally {
      if (dbSession) {
        await dbSession.rollback();
        await dbSession.close();
      }
      await session.close();
    }

    const report = aggregate(runId, opts.testId, results, startedAt);
    this.cache.saveRun(report);
    opts.emit?.({ type: "run.complete", report });
    return report;
  }
}
