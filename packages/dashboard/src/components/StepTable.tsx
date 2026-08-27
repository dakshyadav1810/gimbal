import type { GroundedStep, StepResult } from "@gimbal/shared";
import { Screenshot } from "./Screenshot.js";

const STATUS_CONFIG: Record<
  StepResult["status"],
  { label: string; text: string; bg: string; border: string; icon: string }
> = {
  passed: {
    label: "Passed",
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    icon: "✓",
  },
  failed: {
    label: "Failed",
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    icon: "✗",
  },
  warning: {
    label: "Warning",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    icon: "⚠️",
  },
  skipped: {
    label: "Skipped",
    text: "text-neutral-500 dark:text-neutral-400",
    bg: "bg-neutral-100 dark:bg-neutral-900",
    border: "border-neutral-200 dark:border-neutral-800",
    icon: "↷",
  },
  stale: {
    label: "Stale",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    icon: "⚠️",
  },
};

const SELECTION_COLORS: Record<string, string> = {
  cached:
    "bg-indigo-500/10 text-brand-primary dark:text-indigo-400 border-indigo-500/20",
  resolver:
    "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  none: "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800",
};

export function StepTable({
  steps,
  specSteps = [],
  showScreenshots = false,
}: {
  steps: StepResult[];
  specSteps?: GroundedStep[];
  showScreenshots?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {steps.map((s, index) => {
        const specStep = specSteps.find((item) => item.id === s.stepId);
        const status = STATUS_CONFIG[s.status];
        const action =
          specStep?.kind === "ui" ? specStep.action : (specStep?.kind ?? "ui");
        const stepIntent = specStep?.intent ?? "Execute action";

        return (
          <div
            key={s.stepId}
            className={`glass-panel border-l-4 rounded-xl p-5 shadow-sm transition-all duration-300 hover:shadow-md ${
              s.status === "passed"
                ? "border-l-emerald-500"
                : s.status === "failed"
                  ? "border-l-rose-500"
                  : "border-l-amber-500"
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              {/* Left Column: Number, Action, Intent, Error Messages */}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 font-mono text-xs font-bold text-neutral-500 dark:bg-neutral-900">
                    {index + 1}
                  </span>

                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-neutral-400">
                    {s.stepId}
                  </span>

                  <span className="rounded-lg bg-neutral-100 px-2 py-0.5 font-mono text-xs font-bold dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300">
                    {action}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.bg} ${status.text} ${status.border}`}
                  >
                    <span>{status.icon}</span>
                    <span>{status.label}</span>
                  </span>

                  {s.selection && (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${SELECTION_COLORS[s.selection]}`}
                    >
                      {s.selection === "cached"
                        ? "⚡ cached"
                        : s.selection === "resolver"
                          ? "🔧 healed"
                          : "none"}
                    </span>
                  )}

                  {s.band && (
                    <span className="inline-flex items-center rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                      Band: {s.band}
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm font-semibold tracking-tight text-neutral-800 dark:text-neutral-200">
                  {stepIntent}
                </p>

                {s.failure && (
                  <div className="mt-3 rounded-lg border border-red-500/10 bg-red-500/5 p-3.5">
                    <p className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                      {s.failure.reason}
                    </p>
                    <p className="mt-1 text-xs text-rose-600/90 dark:text-rose-400/90 leading-relaxed font-mono">
                      {s.failure.message}
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Duration and Screenshot */}
              <div className="flex flex-col items-end gap-3 sm:text-right">
                <span className="font-mono text-xs font-semibold text-neutral-400 dark:text-neutral-500">
                  ⏱ {s.durationMs}ms
                </span>

                {showScreenshots && s.screenshot && (
                  <div className="group relative w-40 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm transition-all duration-300 hover:scale-[1.03] hover:shadow-md">
                    <Screenshot
                      path={s.screenshot}
                      alt={`${s.stepId} screenshot`}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
