import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, History, Loader2, Play } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { api } from "../api.js";
import { JsonEditor } from "../components/JsonEditor.js";
import { useRuns, useTest } from "../queries.js";

export function TestDetailPage({ testId }: { testId: string }) {
  const { data: test, isLoading, isError } = useTest(testId);
  const { data: runs } = useRuns(testId);
  const latest = runs?.[0];
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const run = async () => {
    try {
      setRunning(true);
      setRunError(null);
      const { runId } = await api.runTest(testId);
      queryClient.invalidateQueries({ queryKey: ["tests", testId, "runs"] });
      setLocation(`/tests/${testId}/runs/${runId}`);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-4">
        <Link
          href="/tests"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-brand-primary"
        >
          <ArrowLeft size={13} /> Back to all specs
        </Link>
      </div>

      {isLoading && (
        <div className="panel flex h-32 items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" />
          Loading spec...
        </div>
      )}

      {isError && (
        <div className="panel flex h-32 flex-col items-center justify-center gap-1 border-rose-500/20 bg-rose-500/5">
          <AlertTriangle size={18} className="text-rose-500" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Couldn't load this spec
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            testId "{testId}" may not exist, or core is unreachable.
          </p>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <section className="panel mb-6 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-mono text-xs text-[var(--text-tertiary)]">
                  {testId}
                </span>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--text-primary)]">
                  {test?.flow.name}
                </h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {test?.flow.intent}
                </p>

                {latest && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                    <span>Latest run:</span>
                    <Link
                      href={`/tests/${testId}/runs/${latest.runId}`}
                      className="font-semibold text-brand-primary hover:underline"
                    >
                      {latest.status}
                    </Link>
                    <span>· {new Date(latest.startedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/tests/${testId}/runs`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                >
                  <History size={13} />
                  Run History
                </Link>
                <button
                  type="button"
                  onClick={run}
                  disabled={running}
                  className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-50"
                >
                  {running ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Play size={13} />
                  )}
                  {running ? "Running..." : "Run Spec"}
                </button>
              </div>
            </div>
            {runError && (
              <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
                Failed to start run: {runError}
              </p>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-2.5">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Spec JSON
              </span>
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                validated against the shared Zod schema
              </span>
            </div>
            <JsonEditor testId={testId} />
          </section>
        </>
      )}
    </main>
  );
}
