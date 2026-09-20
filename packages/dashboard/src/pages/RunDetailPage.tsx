import type { RunReport, WsMessage } from "@gimbal/shared";
import { HelpCircle } from "lucide-react";
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
      let logLine = "";
      if (msg.type === "run.start") {
        logLine = `> starting run for ${msg.testId}`;
      } else if (msg.type === "step.start") {
        logLine = `  executing ${msg.stepId}`;
      } else if (msg.type === "step.result") {
        logLine = `  ${msg.result.stepId} ${msg.result.status} (${msg.result.durationMs}ms)`;
      } else if (msg.type === "log") {
        logLine = `[${msg.level}] ${msg.line}`;
      } else if (msg.type === "run.complete") {
        logLine = `> run complete: ${msg.report.status}`;
      }
      if (logLine) setLog((l) => [...l, logLine]);
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
      <section className="panel mb-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-mono text-xs text-[var(--text-tertiary)]">
              {runId}
            </span>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--text-primary)]">
              {test?.flow.name ?? testId}
            </h1>
          </div>

          {report ? (
            <span
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                report.status === "passed"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400"
              }`}
            >
              {report.status === "passed" ? "Passed" : "Failed"}
            </span>
          ) : (
            <span className="flex items-center gap-2 rounded-md border border-brand-primary/20 bg-brand-primary/10 px-3 py-1.5 text-xs font-semibold text-brand-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-primary" />
              In progress
            </span>
          )}
        </div>
      </section>

      {isLive && (
        <section className="panel mb-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-2.5">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Live output
            </span>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-primary" />
          </div>
          <div
            ref={logRef}
            className="max-h-60 overflow-y-auto bg-[var(--surface-sunken)] p-4 font-mono text-xs leading-relaxed text-[var(--text-secondary)]"
          >
            {log.length === 0 ? (
              <div className="italic text-[var(--text-tertiary)]">
                Waiting for logs...
              </div>
            ) : (
              log.map((line, i) => <div key={i}>{line}</div>)
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
          Execution Steps
        </h2>
        {report ? (
          <StepTable
            steps={report.steps}
            specSteps={test?.steps}
            showScreenshots
            testId={testId}
          />
        ) : (
          !isLive && (
            <div className="panel flex h-32 flex-col items-center justify-center gap-1 border-dashed">
              <HelpCircle size={18} className="text-[var(--text-tertiary)]" />
              <h4 className="text-sm font-medium text-[var(--text-primary)]">
                Run not found
              </h4>
              <p className="text-xs text-[var(--text-tertiary)]">
                This run may have expired or been cleared from the cache.
              </p>
            </div>
          )
        )}
      </section>
    </main>
  );
}
