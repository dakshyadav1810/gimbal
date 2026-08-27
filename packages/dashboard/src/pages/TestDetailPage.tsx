import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { api } from "../api.js";
import { JsonEditor } from "../components/JsonEditor.js";
import { useRuns, useTest } from "../queries.js";

export function TestDetailPage({ testId }: { testId: string }) {
  const { data: test } = useTest(testId);
  const { data: runs } = useRuns(testId);
  const latest = runs?.[0];
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [running, setRunning] = useState(false);

  const run = async () => {
    try {
      setRunning(true);
      const { runId } = await api.runTest(testId);
      queryClient.invalidateQueries({ queryKey: ["tests", testId, "runs"] });
      setLocation(`/tests/${testId}/runs/${runId}`);
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* Back Link */}
      <div className="mb-4">
        <Link
          href="/tests"
          className="text-xs font-bold text-neutral-500 hover:text-brand-primary dark:text-neutral-400 dark:hover:text-indigo-400 transition-colors"
        >
          ← Back to All Specs
        </Link>
      </div>

      {/* Header section */}
      <section className="glass-panel mb-8 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-mono text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              Test Specification ID: {testId}
            </span>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
              {test?.name ?? "Loading spec..."}
            </h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {test?.intent ?? "No intent description provided."}
            </p>

            {latest && (
              <div className="mt-4 flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>Latest run:</span>
                <Link
                  href={`/tests/${testId}/runs/${latest.runId}`}
                  className="font-bold underline text-neutral-700 hover:text-brand-primary dark:text-neutral-350 dark:hover:text-indigo-400"
                >
                  {latest.status.toUpperCase()}
                </Link>
                <span>at {new Date(latest.startedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3.5">
            <Link
              href={`/tests/${testId}/runs`}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-xs font-bold text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-350 dark:hover:bg-neutral-900 transition-all duration-200"
            >
              📊 Run History
            </Link>

            <button
              type="button"
              onClick={run}
              disabled={running}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-tr from-brand-primary to-indigo-500 px-5 py-2.5 text-xs font-extrabold text-white hover:from-brand-primary-hover hover:to-indigo-600 shadow-md shadow-brand-primary/10 transition-all duration-200 disabled:opacity-50"
            >
              {running ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Running...
                </>
              ) : (
                <>
                  <span>▶</span>
                  <span>Run Spec</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Code Editor Panel */}
      <section className="glass-panel rounded-2xl overflow-hidden shadow-sm">
        <div className="border-b border-neutral-200 dark:border-neutral-900 bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-3.5 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            Spec Configuration JSON
          </span>
          <span className="font-mono text-[10px] text-neutral-400">
            Validated via Zod IR Schema
          </span>
        </div>
        <div className="p-1">
          <JsonEditor testId={testId} />
        </div>
      </section>
    </main>
  );
}
