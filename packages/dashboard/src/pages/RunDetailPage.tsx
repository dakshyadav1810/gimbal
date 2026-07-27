import type { RunReport, WsMessage } from "@gimbal/shared";
import { useEffect, useRef, useState } from "react";
import { StepTable } from "../components/StepTable.js";
import { useRun } from "../queries.js";
import { wsUrl } from "../api.js";

// Historical runs render the stored RunReport with no WebSocket; a run just kicked off from
// TestDetailPage is still in flight, so live step results stream in over /ws/runs/:id instead
// of waiting on the polled query below (LLD-010 §3.3).
export function RunDetailPage({
  testId,
  runId,
}: {
  testId: string;
  runId: string;
}) {
  const { data: storedReport } = useRun(runId);
  const [liveReport, setLiveReport] = useState<RunReport | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const isLive = !storedReport && !liveReport;

  useEffect(() => {
    if (storedReport) return;
    const ws = new WebSocket(wsUrl(`/ws/runs/${runId}`));
    ws.onmessage = (evt) => {
      const msg: WsMessage = JSON.parse(evt.data);
      setLog((l) => [...l, JSON.stringify(msg)]);
      if (msg.type === "run.complete") setLiveReport(msg.report);
    };
    return () => ws.close();
  }, [runId, storedReport]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const report = storedReport ?? liveReport;

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">
        Run {runId} — <span className="text-neutral-500">{testId}</span>
      </h1>
      {isLive && (
        <div
          ref={logRef}
          className="mb-4 max-h-48 overflow-y-auto rounded border border-neutral-200 p-2 font-mono text-xs dark:border-neutral-800"
        >
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      {report && <StepTable steps={report.steps} showScreenshots />}
      {!report && !isLive && (
        <p className="text-sm text-neutral-500">Run not found.</p>
      )}
    </div>
  );
}
