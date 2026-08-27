import { useState } from "react";
import { Link } from "wouter";
import { useTests, useReviews } from "../queries.js";

export function TestListPage() {
  const { data: tests, isLoading: testsLoading } = useTests();
  const { data: reviews, isLoading: reviewsLoading } = useReviews();
  const [search, setSearch] = useState("");

  const filteredTests = tests?.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.testId.toLowerCase().includes(search.toLowerCase()),
  );

  const totalCount = tests?.length ?? 0;
  const groundedCount = tests?.filter((t) => t.grounded).length ?? 0;
  const ungroundedCount = totalCount - groundedCount;
  const reviewCount = reviews?.length ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 transition-colors duration-300">
      {/* Stats Cards Section */}
      <section className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Specs Card */}
        <div className="glass-panel rounded-2xl p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.01]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-neutral-600 dark:text-neutral-300">
              Total Specs
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-brand-primary dark:text-indigo-400">
              📁
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold tracking-tight text-neutral-950 dark:text-white">
              {totalCount}
            </h3>
            <p className="mt-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Authored test specifications
            </p>
          </div>
        </div>

        {/* Grounded Tests Card */}
        <div className="glass-panel rounded-2xl p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.01]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-neutral-600 dark:text-neutral-300">
              Grounded Tests
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              ✓
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
              {groundedCount}
            </h3>
            <p className="mt-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Ready to execute with cached locators
            </p>
          </div>
        </div>

        {/* Ungrounded Tests Card */}
        <div className="glass-panel rounded-2xl p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.01]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-neutral-600 dark:text-neutral-300">
              Ungrounded
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              ⚡
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold tracking-tight text-amber-600 dark:text-amber-455">
              {ungroundedCount}
            </h3>
            <p className="mt-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Specs requiring initial grounding run
            </p>
          </div>
        </div>

        {/* Pending Reviews Card */}
        <div className="glass-panel rounded-2xl p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.01]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-neutral-600 dark:text-neutral-300">
              Stale Steps
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-455">
              ⚠️
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-extrabold tracking-tight text-rose-600 dark:text-rose-455">
              {reviewCount}
            </h3>
            <p className="mt-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Steps requiring review / manual repair
            </p>
          </div>
        </div>
      </section>

      {/* Control Area (Search & Filters) */}
      <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search specs by ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 pl-10 text-sm shadow-sm transition-all placeholder:text-neutral-400 text-neutral-900 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-400 dark:focus:ring-indigo-400/20"
          />
          <span className="absolute left-3.5 top-3.5 text-neutral-450 dark:text-neutral-500">
            🔍
          </span>
        </div>
      </section>

      {/* Grid List Section */}
      <section>
        {(testsLoading || reviewsLoading) && (
          <div className="flex h-40 items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            <span className="ml-3 text-sm text-neutral-550 dark:text-neutral-400 font-medium">
              Loading specs...
            </span>
          </div>
        )}

        {!testsLoading && filteredTests?.length === 0 && (
          <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 p-8 dark:border-neutral-850 bg-white/10 dark:bg-neutral-900/10">
            <span className="text-2xl">📂</span>
            <h4 className="mt-2 text-sm font-bold text-neutral-850 dark:text-neutral-200">
              No specs found
            </h4>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Try adjusting your search filter or author a spec over MCP.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTests?.map((t) => (
            <div
              key={t.testId}
              className="glass-panel flex flex-col justify-between rounded-2xl p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.01]"
            >
              <div>
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-xs font-extrabold text-neutral-450 dark:text-neutral-500 uppercase tracking-wider">
                    {t.testId}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                      t.grounded
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400 dark:border-amber-500/20"
                    }`}
                  >
                    {t.grounded ? "grounded" : "ungrounded"}
                  </span>
                </div>
                <h4 className="mt-3 text-base font-bold tracking-tight text-neutral-900 dark:text-white">
                  {t.name}
                </h4>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-neutral-100 pt-4 dark:border-neutral-900/80">
                <Link
                  href={`/tests/${t.testId}`}
                  className="text-xs font-bold text-neutral-500 hover:text-brand-primary dark:text-neutral-400 dark:hover:text-indigo-405 transition-colors"
                >
                  Configure Spec →
                </Link>
                <Link
                  href={`/tests/${t.testId}`}
                  className="inline-flex items-center justify-center rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200 transition-colors"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
