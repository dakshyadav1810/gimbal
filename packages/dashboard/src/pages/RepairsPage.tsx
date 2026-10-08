import type { Repair } from "@gimbal/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Clipboard, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { api } from "../api.js";
import { BandBadge } from "../components/StatusBadge.js";
import { useRepairs } from "../queries.js";

const OPEN = new Set(["proposed", "needed"]);

function Where({ label, selector }: { label?: string; selector: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium text-[var(--text-primary)]">
        {label ?? "(no label)"}
      </div>
      <div className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">
        {selector || "(no selector)"}
      </div>
    </div>
  );
}

function Evidence({ r }: { r: Repair }) {
  if (!r.evidence) return null;
  const { evidence } = r;
  return (
    <div className="mt-3 rounded-md border border-[var(--border-default)] bg-[var(--surface-sunken)] p-3 text-xs">
      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
        <span>Confidence {evidence.confidence.toFixed(2)}</span>
        <BandBadge band={evidence.band} />
        {evidence.runnerUp && (
          <span className="text-[var(--text-tertiary)]">
            runner-up "{evidence.runnerUp.label ?? "?"}" at{" "}
            {evidence.runnerUp.score.toFixed(2)}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-2 font-mono text-[11px] text-[var(--text-tertiary)]">
        {Object.entries(evidence.signals).map(([k, v]) => (
          <div key={k}>
            <div>{k}</div>
            <div className="text-[var(--text-primary)]">{v.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Verification({ r }: { r: Repair }) {
  const v = r.verification;
  if (!v) return null;
  const tone =
    v.result === "verified"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-amber-600 dark:text-amber-400";
  const text =
    v.result === "verified"
      ? `Verified by ${v.level === "outcome" ? "the step's own outcome" : "the effect seen at grounding"}`
      : "Not verified: nothing to check this heal against. Add an outcome to the step.";
  return (
    <p className={`mt-3 text-xs ${tone}`}>
      {text}
      {v.detail && v.result !== "verified" ? ` (${v.detail})` : ""}
    </p>
  );
}

function RepairCard({ r }: { r: Repair }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const decide = useMutation({
    mutationFn: (action: "accept" | "reject") =>
      action === "accept" ? api.acceptRepair(r.id) : api.rejectRepair(r.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] }),
  });

  const copy = async () => {
    const ctx = await api.getRepairContext(r.testId);
    await navigator.clipboard.writeText(
      `This Gimbal step could not be healed (step ${r.stepId}). Fix its target and call the \`submitRepair\` MCP tool with testId=${r.testId}.\n\n${JSON.stringify(ctx, null, 2)}`,
    );
    setCopied(true);
  };

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/tests/${r.testId}`}
          className="font-mono text-xs text-brand-primary hover:underline"
        >
          {r.testId} / {r.stepId}
        </Link>
        <span className="rounded-md border border-[var(--border-default)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-secondary)]">
          {r.status === "needed" ? "needs a fix" : r.status}
        </span>
      </div>

      {r.after ? (
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Where label={r.before.label} selector={r.before.selector} />
          <span className="text-[var(--text-tertiary)]">→</span>
          <Where label={r.after.label} selector={r.after.selector} />
        </div>
      ) : (
        <div className="mt-4">
          <Where label={r.before.label} selector={r.before.selector} />
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Gimbal abstained: {r.reason ?? "nothing trustworthy was found"}.
          </p>
        </div>
      )}

      <Evidence r={r} />
      <Verification r={r} />

      {r.status === "proposed" && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => decide.mutate("accept")}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:opacity-50"
          >
            <Check size={13} /> Accept
          </button>
          <button
            type="button"
            disabled={decide.isPending}
            onClick={() => decide.mutate("reject")}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            <X size={13} /> Reject
          </button>
        </div>
      )}
      {r.status === "needed" && (
        <div className="mt-4">
          <p className="text-xs text-[var(--text-tertiary)]">
            Gimbal has no model of its own. Hand this to your coding agent to
            re-author the step.
          </p>
          <button
            type="button"
            onClick={copy}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-primary-hover"
          >
            {copied ? <Check size={13} /> : <Clipboard size={13} />}
            {copied ? "Context copied" : "Copy repair context"}
          </button>
        </div>
      )}
      {decide.isError && (
        <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
          {(decide.error as Error).message}
        </p>
      )}
    </div>
  );
}

export function RepairsPage() {
  const { data: repairs, isLoading } = useRepairs();
  const [showAll, setShowAll] = useState(false);
  const rows = (repairs ?? []).filter((r) => showAll || OPEN.has(r.status));

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <section className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Repairs
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            What Gimbal healed during runs, and the steps it would not guess
            about.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show decided
        </label>
      </section>

      {isLoading && (
        <div className="panel flex h-32 items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Loading repairs...
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="panel flex flex-col items-center justify-center gap-1 p-12 text-center">
          <CheckCircle2 size={20} className="text-emerald-500" />
          <h4 className="text-sm font-medium text-[var(--text-primary)]">
            Nothing to review
          </h4>
          <p className="text-xs text-[var(--text-tertiary)]">
            No open heal proposals and no steps waiting for a fix.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <RepairCard key={r.id} r={r} />
        ))}
      </div>
    </main>
  );
}
