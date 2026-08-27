import { Link } from "wouter";
import { useRuns } from "../queries.js";

const STATUS_CONFIG: Record<
  string,
  { label: string; text: string; bg: string; border: string }
> = {
  passed: {
    label: "Passed",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  failed: {
    label: "Failed",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
  },
  running: {
    label: "Running",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
};

export function RunHistoryPage({ testId }: { testId: string }) {
  const { data: runs, isLoading } = useRuns(testId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* Back to details link */}
      <div className="mb-4">
        <Link
          href={`/tests/${testId}`}
          className="text-xs font-bold text-neutral-500 hover:text-brand-primary dark:text-neutral-400 dark:hover:text-indigo-400 transition-colors"
        >
          ← Back to Spec Configuration
        </Link>
      </div>

      {/* Title block */}
      <section className="mb-8">
        <span className="font-mono text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
          Execution History
        </span>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          Run History: {testId}
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          Trace and diagnostic history of all executions
        </p>
      </section>

      {/* History table card */}
      <section className="glass-panel rounded-2xl overflow-hidden shadow-sm">
        {isLoading && (
          <div className="flex h-40 items-center justify-center p-8">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            <span className="ml-3 text-sm text-neutral-500">
              Loading history...
            </span>
          </div>
        )}

        {!isLoading && runs?.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <span className="text-3xl">📭</span>
            <h4 className="mt-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              No runs recorded
            </h4>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Click Run on the spec page to trigger execution.
            </p>
          </div>
        )}

        {!isLoading && runs && runs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-900 bg-neutral-50/50 dark:bg-neutral-900/30 text-neutral-500 font-mono text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-semibold">Run ID / Status</th>
                  <th className="px-6 py-4 font-semibold">Review State</th>
                  <th className="px-6 py-4 font-semibold">Started At</th>
                  <th className="px-6 py-4 font-semibold">Finished At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-900">
                {runs.map((r) => {
                  const status =
                    STATUS_CONFIG[r.status] ?? STATUS_CONFIG.running;
                  return (
                    <tr
                      key={r.runId}
                      className="hover:bg-neutral-50/40 dark:hover:bg-neutral-900/10 transition-colors duration-200"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/tests/${testId}/runs/${r.runId}`}
                          className="flex items-center gap-3.5 group"
                        >
                          <span
                            className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold ${status.bg} ${status.text} ${status.border}`}
                          >
                            {status.label}
                          </span>
                          <span className="font-mono text-xs font-bold text-neutral-500 group-hover:text-brand-primary dark:group-hover:text-indigo-400 transition-colors">
                            {r.runId.substring(0, 8)}...
                          </span>
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        {r.needsReview ? (
                          <span className="inline-flex items-center rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                            needs review
                          </span>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-600 font-mono text-xs">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                        {new Date(r.startedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                        {r.status === "running"
                          ? "—"
                          : new Date(r.finishedAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
