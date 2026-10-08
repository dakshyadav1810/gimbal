import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useReviews } from "../queries.js";

export function ReviewQueuePage() {
  const { data: reviews, isLoading } = useReviews();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <section className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Review Queue
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Steps that failed deterministic runtime healing and require
          re-authoring
        </p>
      </section>

      <section className="panel overflow-hidden">
        {isLoading && (
          <div className="flex h-32 items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Checking for stale steps...
          </div>
        )}

        {!isLoading && reviews?.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 p-12 text-center">
            <CheckCircle2 size={20} className="text-emerald-500" />
            <h4 className="text-sm font-medium text-[var(--text-primary)]">
              Review queue empty
            </h4>
            <p className="text-xs text-[var(--text-tertiary)]">
              All tests are grounding and executing successfully.
            </p>
          </div>
        )}

        {!isLoading && reviews && reviews.length > 0 && (
          <div className="divide-y divide-[var(--border-default)]">
            {reviews.map((r) => (
              <div
                key={`${r.testId}:${r.stepId}`}
                className="flex flex-col gap-3 p-4 hover:bg-[var(--surface-sunken)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">
                    {r.testId}
                  </h4>
                  <p className="mt-0.5 font-mono text-xs text-rose-600 dark:text-rose-400">
                    {r.stepId}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-[var(--text-tertiary)]">
                    {r.url}
                  </p>
                </div>
                <Link
                  href={`/reviews/${r.testId}/${r.stepId}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-panel)]"
                >
                  Inspect <ArrowRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
