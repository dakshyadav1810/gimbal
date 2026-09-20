import type { GroundedStep, StepResult } from "@gimbal/shared";
import { ChevronRight, Clock } from "lucide-react";
import { useState } from "react";
import { useTestCandidates } from "../queries.js";
import { ResolutionPanel } from "./ResolutionPanel.js";
import { Screenshot } from "./Screenshot.js";
import { StatusBadge } from "./StatusBadge.js";

const SELECTION_LABEL: Record<string, string> = {
  cached: "cached",
  resolver: "healed",
  none: "none",
};

export function StepTable({
  steps,
  specSteps = [],
  showScreenshots = false,
  testId,
}: {
  steps: StepResult[];
  specSteps?: GroundedStep[];
  showScreenshots?: boolean;
  // When given, each row can expand into its grounding-time resolution ranking (Phase 5a).
  testId?: string;
}) {
  const { data: candidatesDoc } = useTestCandidates(testId ?? "");
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, index) => {
        const specStep = specSteps.find((item) => item.id === s.stepId);
        const action =
          specStep?.kind === "ui" ? specStep.action : (specStep?.kind ?? "ui");
        const stepIntent = specStep?.intent ?? "Execute action";
        const stepResolution = candidatesDoc?.steps.find(
          (cs) => cs.stepId === s.stepId,
        )?.resolution;
        const isExpanded = expandedStepId === s.stepId;

        return (
          <div key={s.stepId} className="panel p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--surface-sunken)] font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
                    {index + 1}
                  </span>
                  <span className="font-mono text-xs text-[var(--text-tertiary)]">
                    {s.stepId}
                  </span>
                  <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--text-secondary)]">
                    {action}
                  </span>
                  <StatusBadge status={s.status} />
                  {s.selection && (
                    <span className="rounded-md border border-[var(--border-default)] px-1.5 py-0.5 text-[11px] text-[var(--text-tertiary)]">
                      {SELECTION_LABEL[s.selection]}
                    </span>
                  )}
                  {s.band && (
                    <span className="rounded-md border border-[var(--border-default)] px-1.5 py-0.5 text-[11px] text-[var(--text-tertiary)]">
                      band: {s.band}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                  {stepIntent}
                </p>

                {s.failure && (
                  <div className="mt-2 rounded-md border border-rose-500/20 bg-rose-500/5 p-3">
                    <p className="font-mono text-xs font-semibold text-rose-700 dark:text-rose-400">
                      {s.failure.reason}
                    </p>
                    <p className="mt-1 font-mono text-xs text-rose-700/80 dark:text-rose-400/80">
                      {s.failure.message}
                    </p>
                  </div>
                )}

                {s.note && (
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">{s.note}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className="flex items-center gap-1 font-mono text-xs text-[var(--text-tertiary)]">
                  <Clock size={11} />
                  {s.durationMs}ms
                </span>
                {showScreenshots && s.screenshot && (
                  <div className="w-32 overflow-hidden rounded border border-[var(--border-default)]">
                    <Screenshot path={s.screenshot} alt={`${s.stepId} screenshot`} />
                  </div>
                )}
              </div>
            </div>

            {stepResolution && stepResolution.candidates.length > 0 && (
              <div className="mt-3 border-t border-[var(--border-default)] pt-3">
                <button
                  type="button"
                  onClick={() => setExpandedStepId(isExpanded ? null : s.stepId)}
                  className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <ChevronRight
                    size={13}
                    className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                  Resolution ranking
                  {s.selection === "cached" && (
                    <span className="font-normal text-[var(--text-tertiary)]">
                      (grounding-time ranking — this step ran from cache)
                    </span>
                  )}
                </button>
                {isExpanded && (
                  <div className="mt-3">
                    <ResolutionPanel candidates={stepResolution.candidates} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
