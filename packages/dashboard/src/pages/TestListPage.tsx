import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Search,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { TestSummary } from "../api.js";
import { useTests } from "../queries.js";

function StatTile({
  label,
  value,
  sublabel,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  sublabel: string;
  tone: "neutral" | "success" | "warning" | "danger";
  Icon: typeof CheckCircle2;
}) {
  const toneClass = {
    neutral: "text-[var(--text-primary)]",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {label}
        </span>
        <Icon size={16} className="text-[var(--text-tertiary)]" />
      </div>
      <div className={`mt-3 text-2xl font-bold tracking-tight ${toneClass}`}>
        {value}
      </div>
      <p className="mt-1 text-xs text-[var(--text-tertiary)]">{sublabel}</p>
    </div>
  );
}

// Three states a person acts on: pass, needs review (nothing failed but something healed or abstained), fail.
function LastRun({ lastRun }: { lastRun: TestSummary["lastRun"] }) {
  if (!lastRun)
    return <span className="text-[var(--text-tertiary)]">never run</span>;
  const [label, cls] = {
    running: ["RUNNING", "text-[var(--text-secondary)]"],
    passed: ["PASS", "text-emerald-600 dark:text-emerald-400"],
    failed: ["FAIL", "text-rose-600 dark:text-rose-400"],
    review: ["NEEDS REVIEW", "text-amber-600 dark:text-amber-400"],
  }[lastRun.outcome];
  return <span className={`font-semibold ${cls}`}>{label}</span>;
}

export function TestListPage() {
  const { data: tests, isLoading: testsLoading } = useTests();
  const [search, setSearch] = useState("");

  const filteredTests = tests?.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.testId.toLowerCase().includes(search.toLowerCase()),
  );

  const totalCount = tests?.length ?? 0;
  const groundedCount = tests?.filter((t) => t.grounded).length ?? 0;
  const ungroundedCount = totalCount - groundedCount;
  const reviewCount = tests?.reduce((n, t) => n + t.openRepairs, 0) ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total Specs"
          value={totalCount}
          sublabel="Authored test specifications"
          tone="neutral"
          Icon={FolderOpen}
        />
        <StatTile
          label="Grounded"
          value={groundedCount}
          sublabel="Ready to execute"
          tone="success"
          Icon={CheckCircle2}
        />
        <StatTile
          label="Ungrounded"
          value={ungroundedCount}
          sublabel="Needs an initial grounding run"
          tone="warning"
          Icon={AlertTriangle}
        />
        <StatTile
          label="Open Repairs"
          value={reviewCount}
          sublabel="Heal proposals and steps waiting for a fix"
          tone="danger"
          Icon={AlertTriangle}
        />
      </section>

      <section className="mb-5">
        <div className="relative max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            type="text"
            placeholder="Search specs by ID or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          />
        </div>
      </section>

      <section>
        {testsLoading && (
          <div className="flex h-32 items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            Loading specs...
          </div>
        )}

        {!testsLoading && filteredTests?.length === 0 && (
          <div className="panel flex h-32 flex-col items-center justify-center gap-1 border-dashed">
            <FolderOpen size={20} className="text-[var(--text-tertiary)]" />
            <h4 className="text-sm font-medium text-[var(--text-primary)]">
              No specs found
            </h4>
            <p className="text-xs text-[var(--text-tertiary)]">
              Try adjusting your search, or author a spec over MCP.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTests?.map((t) => (
            <Link
              key={t.testId}
              href={`/tests/${t.testId}`}
              className="panel block p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-mono text-xs font-medium text-[var(--text-tertiary)]">
                  {t.testId}
                </span>
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                    t.grounded
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {t.grounded ? "grounded" : "ungrounded"}
                </span>
              </div>
              <h4 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {t.name}
              </h4>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <LastRun lastRun={t.lastRun} />
                {t.openRepairs > 0 && (
                  <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                    {t.openRepairs} to review
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
