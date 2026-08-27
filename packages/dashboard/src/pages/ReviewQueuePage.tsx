import { Link } from "wouter";
import { useReviews } from "../queries.js";

export function ReviewQueuePage() {
  const { data: reviews, isLoading } = useReviews();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* Title section */}
      <section className="mb-8">
        <span className="font-mono text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
          Observed Drift
        </span>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          Review Queue
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          Steps that failed deterministic runtime healing and require
          re-authoring
        </p>
      </section>

      {/* Queue items list */}
      <section className="glass-panel rounded-2xl overflow-hidden shadow-sm">
        {isLoading && (
          <div className="flex h-40 items-center justify-center p-8">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            <span className="ml-3 text-sm text-neutral-500">
              Checking for stale steps...
            </span>
          </div>
        )}

        {!isLoading && reviews?.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <span className="text-3xl">🎉</span>
            <h4 className="mt-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Review queue empty
            </h4>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              All tests are grounding and executing successfully.
            </p>
          </div>
        )}

        {!isLoading && reviews && reviews.length > 0 && (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-900">
            {reviews.map((r, index) => (
              <div
                key={`${r.testId}:${r.stepId}`}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 hover:bg-neutral-50/50 dark:hover:bg-neutral-900/10 transition-colors duration-200"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/10 font-mono text-xs font-bold text-rose-600 dark:text-rose-450 mt-0.5">
                    {index + 1}
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                      Test spec: {r.testId}
                    </h4>
                    <p className="mt-1 font-mono text-xs text-rose-600 dark:text-rose-400">
                      Step ID: {r.stepId}
                    </p>
                    <p className="mt-1.5 text-xs text-neutral-400 font-mono truncate max-w-sm sm:max-w-md">
                      URL: {r.url}
                    </p>
                  </div>
                </div>

                <div className="mt-4 sm:mt-0 flex items-center justify-end">
                  <Link
                    href={`/reviews/${r.testId}/${r.stepId}`}
                    className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200 shadow-sm transition-colors"
                  >
                    Inspect Candidates →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
