import { Link } from "wouter";
import { useReviews } from "../queries.js";

export function ReviewQueuePage() {
  const { data: reviews, isLoading } = useReviews();

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Review queue</h1>
      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {reviews?.length === 0 && (
        <p className="text-sm text-neutral-500">No stale steps to review.</p>
      )}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {reviews?.map((r) => (
          <li key={`${r.testId}:${r.stepId}`}>
            <Link
              href={`/reviews/${r.testId}/${r.stepId}`}
              className="flex items-center justify-between py-2 text-sm hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              <span>
                {r.testId} / {r.stepId}
              </span>
              <span className="text-xs text-neutral-400">{r.url}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
