import { ArrowLeft, History, Inbox, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { StatusBadge } from "../components/StatusBadge.js";
import { useRuns } from "../queries.js";

export function RunHistoryPage({ testId }: { testId: string }) {
  const { data: runs, isLoading } = useRuns(testId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-4">
        <Link
          href={`/tests/${testId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-brand-primary"
        >
          <ArrowLeft size={13} /> Back to spec
        </Link>
      </div>

      <section className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-[var(--text-primary)]">
          <History size={18} className="text-[var(--text-tertiary)]" />
          Run History
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Execution history for {testId}
        </p>
      </section>

      <section className="panel overflow-hidden">
        {isLoading && (
          <div className="flex h-32 items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading history...
          </div>
        )}

        {!isLoading && runs?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 p-12 text-center">
            <Inbox size={20} className="text-[var(--text-tertiary)]" />
            <h4 className="text-sm font-medium text-[var(--text-primary)]">
              No runs recorded
            </h4>
            <p className="text-xs text-[var(--text-tertiary)]">
              Run the spec to see execution history here.
            </p>
          </div>
        )}

        {!isLoading && runs && runs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-sunken)] text-xs text-[var(--text-tertiary)]">
                  <th className="px-5 py-3 font-medium">Run</th>
                  <th className="px-5 py-3 font-medium">Review</th>
                  <th className="px-5 py-3 font-medium">Started</th>
                  <th className="px-5 py-3 font-medium">Finished</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {runs.map((r) => (
                  <tr key={r.runId} className="hover:bg-[var(--surface-sunken)]">
                    <td className="px-5 py-3">
                      <Link
                        href={`/tests/${testId}/runs/${r.runId}`}
                        className="flex items-center gap-3"
                      >
                        <StatusBadge status={r.status as never} />
                        <span className="font-mono text-xs text-[var(--text-secondary)]">
                          {r.runId.substring(0, 8)}
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      {r.needsReview ? (
                        <span className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400">
                          needs review
                        </span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[var(--text-secondary)]">
                      {new Date(r.startedAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[var(--text-secondary)]">
                      {r.status === "running"
                        ? "—"
                        : new Date(r.finishedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
