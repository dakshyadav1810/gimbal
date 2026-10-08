import type { Band, StepResult } from "@gimbal/shared";
import { AlertTriangle, Check, CircleSlash, X } from "lucide-react";

// Single source of truth for status/band color + iconography (PLAN-002 Phase B) — previously
// redefined with slightly different values in StepTable.tsx, ResolutionPanel.tsx, and
// RunHistoryPage.tsx.
const STATUS_STYLES: Record<
  StepResult["status"] | "running",
  { label: string; className: string; Icon: typeof Check }
> = {
  passed: {
    label: "Passed",
    className:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    Icon: Check,
  },
  failed: {
    label: "Failed",
    className:
      "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    Icon: X,
  },
  warning: {
    label: "Warning",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    Icon: AlertTriangle,
  },
  stale: {
    label: "Stale",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    Icon: AlertTriangle,
  },
  skipped: {
    label: "Skipped",
    className:
      "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20",
    Icon: CircleSlash,
  },
  running: {
    label: "Running",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    Icon: AlertTriangle,
  },
};

export function StatusBadge({
  status,
  showIcon = true,
}: {
  status: StepResult["status"] | "running";
  showIcon?: boolean;
}) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${s.className}`}
    >
      {showIcon && <s.Icon size={12} strokeWidth={2.5} />}
      {s.label}
    </span>
  );
}

const BAND_STYLES: Record<Band, string> = {
  high: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  medium:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  low: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
};

export function BandBadge({ band }: { band: Band }) {
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BAND_STYLES[band]}`}
    >
      {band}
    </span>
  );
}
