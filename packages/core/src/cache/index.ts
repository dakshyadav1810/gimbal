import type { Band, RunReport, RunSummary, StepResult } from "@gimbal/shared";
import { and, desc, eq } from "drizzle-orm";
import type { DrizzleDb } from "./db.js";
import * as schema from "./schema.js";

export interface CachedSelector {
  testId: string;
  stepId: string;
  domHash: string;
  cachedSelector: string;
  band: Band;
}

export interface HealAuditEntry {
  testId: string;
  stepId: string;
  event: "healed" | "stale" | "heal_rejected";
  fromSel: string | null;
  toSel: string | null;
  band?: Band;
  reason?: string;
  at: string;
}

export interface CacheStore {
  getSelector(
    testId: string,
    stepId: string,
    domHash: string,
  ): CachedSelector | null;
  putSelector(e: CachedSelector): void;
  clearSelectorsForTest(testId: string): void;
  getEmbedding(hash: string): Float32Array | null;
  putEmbedding(hash: string, model: string, v: Float32Array): void;
  startRun(runId: string, testId: string, startedAt: string): void;
  saveRun(report: RunReport): void;
  failRun(runId: string, finishedAt: string): void;
  getRun(runId: string): RunReport | null;
  listRuns(testId: string): RunSummary[];
  appendHeal(entry: HealAuditEntry): void;
}

export class SqliteCacheStore implements CacheStore {
  constructor(private db: DrizzleDb) {}

  getSelector(
    testId: string,
    stepId: string,
    domHash: string,
  ): CachedSelector | null {
    const row = this.db
      .select()
      .from(schema.resolutionCache)
      .where(
        and(
          eq(schema.resolutionCache.testId, testId),
          eq(schema.resolutionCache.stepId, stepId),
          eq(schema.resolutionCache.domHash, domHash),
        ),
      )
      .get();
    if (!row) return null;
    return {
      testId: row.testId,
      stepId: row.stepId,
      domHash: row.domHash,
      cachedSelector: row.cachedSelector,
      band: row.band as Band,
    };
  }

  putSelector(e: CachedSelector): void {
    this.db
      .insert(schema.resolutionCache)
      .values({ ...e, groundedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: [
          schema.resolutionCache.testId,
          schema.resolutionCache.stepId,
          schema.resolutionCache.domHash,
        ],
        set: {
          cachedSelector: e.cachedSelector,
          band: e.band,
          groundedAt: new Date().toISOString(),
        },
      })
      .run();
  }

  // A fresh groundTest must never be shadowed by a stale runtime-heal cache entry: the cache key
  // (testId, stepId, domHash) can coincidentally collide across groundings when the page's
  // interactive-DOM signature happens to match, letting a superseded selector outlive the
  // re-ground that fixed it (LLD-005 §8 gap).
  clearSelectorsForTest(testId: string): void {
    this.db
      .delete(schema.resolutionCache)
      .where(eq(schema.resolutionCache.testId, testId))
      .run();
  }

  getEmbedding(hash: string): Float32Array | null {
    const row = this.db
      .select()
      .from(schema.embeddings)
      .where(eq(schema.embeddings.hash, hash))
      .get();
    if (!row) return null;
    return new Float32Array(
      row.vector.buffer,
      row.vector.byteOffset,
      row.vector.length / 4,
    );
  }

  putEmbedding(hash: string, model: string, v: Float32Array): void {
    this.db
      .insert(schema.embeddings)
      .values({
        hash,
        model,
        vector: Buffer.from(v.buffer, v.byteOffset, v.byteLength),
      })
      .onConflictDoNothing()
      .run();
  }

  // Placeholder row so GET /runs/:id can distinguish "still running" from "never existed" while
  // the run executes — saveRun()/failRun() below overwrite it once the run reaches a final state.
  startRun(runId: string, testId: string, startedAt: string): void {
    this.db
      .insert(schema.runs)
      .values({
        runId,
        testId,
        status: "running",
        needsReview: false,
        startedAt,
        finishedAt: startedAt,
      })
      .run();
  }

  saveRun(report: RunReport): void {
    this.db
      .insert(schema.runs)
      .values({
        runId: report.runId,
        testId: report.testId,
        status: report.status,
        needsReview: report.needsReview,
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
      })
      .onConflictDoUpdate({
        target: schema.runs.runId,
        set: {
          status: report.status,
          needsReview: report.needsReview,
          finishedAt: report.finishedAt,
        },
      })
      .run();
    for (const s of report.steps) {
      this.db
        .insert(schema.stepResults)
        .values({
          runId: report.runId,
          stepId: s.stepId,
          status: s.status,
          selectionSource: s.selection ?? null,
          band: s.band ?? null,
          durationMs: s.durationMs,
          screenshotPath: s.screenshot ?? null,
          failureReason: s.failure?.reason ?? null,
          failureMessage: s.failure?.message ?? null,
        })
        .run();
    }
  }

  // A run that throws before aggregate()/saveRun() run leaves the placeholder row stuck at
  // "running" forever; this marks it "failed" so polling stops treating a crashed run as in-progress.
  failRun(runId: string, finishedAt: string): void {
    this.db
      .update(schema.runs)
      .set({ status: "failed", finishedAt })
      .where(eq(schema.runs.runId, runId))
      .run();
  }

  getRun(runId: string): RunReport | null {
    const run = this.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.runId, runId))
      .get();
    if (!run) return null;
    const steps = this.db
      .select()
      .from(schema.stepResults)
      .where(eq(schema.stepResults.runId, runId))
      .all();
    return {
      runId: run.runId,
      testId: run.testId,
      status: run.status as "running" | "passed" | "failed",
      needsReview: run.needsReview,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      steps: steps.map((s) => ({
        stepId: s.stepId,
        status: s.status as StepResult["status"],
        selection: (s.selectionSource ?? undefined) as StepResult["selection"],
        band: (s.band ?? undefined) as StepResult["band"],
        durationMs: s.durationMs,
        screenshot: s.screenshotPath ?? undefined,
        failure:
          s.failureReason || s.failureMessage
            ? {
                reason: s.failureReason ?? "",
                message: s.failureMessage ?? "",
              }
            : undefined,
      })),
    };
  }

  listRuns(testId: string): RunSummary[] {
    const rows = this.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.testId, testId))
      .orderBy(desc(schema.runs.startedAt))
      .all();
    return rows.map((run) => ({
      runId: run.runId,
      testId: run.testId,
      status: run.status as "running" | "passed" | "failed",
      needsReview: run.needsReview,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    }));
  }

  appendHeal(entry: HealAuditEntry): void {
    this.db
      .insert(schema.healAudit)
      .values({
        ...entry,
        band: entry.band ?? null,
        reason: entry.reason ?? null,
      })
      .run();
  }
}
