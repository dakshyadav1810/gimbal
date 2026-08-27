import type { RunReport, WsMessage } from "@gimbal/shared";
import { useEffect, useRef, useState } from "react";
import { wsUrl } from "../api.js";
import { StepTable } from "../components/StepTable.js";
import { useRun, useTest } from "../queries.js";

export function RunDetailPage({
  testId,
  runId,
}: {
  testId: string;
  runId: string;
}) {
  const { data: storedReport } = useRun(runId);
  const { data: test } = useTest(testId);

  const finishedReport =
    storedReport && storedReport.status !== "running"
      ? storedReport
      : undefined;
  const [liveReport, setLiveReport] = useState<RunReport | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const isLive = !finishedReport && !liveReport;

  useEffect(() => {
    if (finishedReport) return;
    const ws = new WebSocket(wsUrl(`/ws/runs/${runId}`));
    ws.onmessage = (evt) => {
      const msg: WsMessage = JSON.parse(evt.data);
      // Format websocket messages to be clean strings in the logger
      let logLine = "";
      if (msg.type === "run.start") {
        logLine = `▶ Starting run for test: ${msg.testId}`;
      } else if (msg.type === "step.start") {
        logLine = `  ↳ Executing step: ${msg.stepId}`;
      } else if (msg.type === "step.result") {
        logLine = `  ✓ Step ${msg.result.stepId} ${msg.result.status} (${msg.result.durationMs}ms)`;
      } else if (msg.type === "log") {
        logLine = `[${msg.level.toUpperCase()}] ${msg.line}`;
      } else if (msg.type === "run.complete") {
        logLine = `⏹ Run complete: ${msg.report.status.toUpperCase()}`;
      }
      if (logLine) {
        setLog((l) => [...l, logLine]);
      }
      if (msg.type === "run.complete") setLiveReport(msg.report);
    };
    return () => ws.close();
  }, [runId, finishedReport]);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [log]);

  const report = finishedReport ?? liveReport;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* Header Info Panel */}
      <section className="glass-panel mb-8 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-mono text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              Run ID: {runId}
            </span>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
              {test?.name ?? testId}
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Flow validation results
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {report ? (
              <span
                className={`rounded-xl px-4 py-2 text-sm font-bold border ${
                  report.status === "passed"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                }`}
              >
                {report.status === "passed" ? "✓ PASSED" : "✗ FAILED"}
              </span>
            ) : (
              <span className="flex items-center gap-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 text-sm font-bold text-brand-primary dark:text-indigo-400">
                <span className="h-2 w-2 rounded-full bg-brand-primary animate-ping" />
                IN PROGRESS
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Live Log Explorer */}
      {isLive && (
        <section className="glass-panel mb-8 rounded-2xl overflow-hidden shadow-sm">
          <div className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Live Console Output
            </span>
            <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          </div>
          <div
            ref={logRef}
            className="max-h-60 overflow-y-auto p-5 font-mono text-xs text-neutral-700 dark:text-neutral-300 bg-neutral-950 text-indigo-300/90 leading-relaxed"
          >
            {log.length === 0 ? (
              <div className="text-neutral-500 italic">Waiting for logs...</div>
            ) : (
              log.map((line, i) => (
                <div
                  key={i}
                  className="py-0.5 border-b border-neutral-900/40 last:border-0"
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* Steps Table Card */}
      <section>
        <h2 className="mb-4 text-base font-bold text-neutral-900 dark:text-white">
          Execution Steps
        </h2>
        {report ? (
          <StepTable
            steps={report.steps}
            specSteps={test?.steps}
            showScreenshots
          />
        ) : (
          !isLive && (
            <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 p-8 dark:border-neutral-800">
              <span className="text-2xl">❓</span>
              <h4 className="mt-2 text-sm font-semibold">Run not found</h4>
              <p className="text-xs text-neutral-400">
                This run may have expired or been cleared from the SQLite cache.
              </p>
            </div>
          )
        )}
      </section>
    </main>
  );
}
