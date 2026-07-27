import { Link } from "wouter";
import { useTests } from "../queries.js";

export function TestListPage() {
  const { data: tests, isLoading } = useTests();

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Tests</h1>
      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {tests?.map((t) => (
          <li key={t.testId}>
            <Link
              href={`/tests/${t.testId}`}
              className="flex items-center justify-between py-2 text-sm hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              <span>{t.name}</span>
              <span className="text-xs text-neutral-400">
                {t.grounded ? "grounded" : "ungrounded"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
