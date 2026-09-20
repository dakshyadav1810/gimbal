import type { Candidate } from "@gimbal/shared";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { BandBadge } from "./StatusBadge.js";

// Extracted from ReviewDetailPage.tsx's original inline "Ranked Candidates Explorer" — behavior-
// neutral extraction, parameterized by `candidates` so RunDetailPage's per-step rows (grounding-
// time ranking, not necessarily this run's own resolution) can reuse the same UI.
export function ResolutionPanel({ candidates }: { candidates: Candidate[] }) {
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(
    candidates[0] ?? null,
  );

  useEffect(() => {
    setSelectedCandidate(candidates[0] ?? null);
  }, [candidates]);

  if (candidates.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--border-default)] p-8">
        <Search size={18} className="text-[var(--text-tertiary)]" />
        <p className="text-xs text-[var(--text-tertiary)]">
          No interactive candidates matched the resolver gate on this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex max-h-60 flex-col gap-1 overflow-y-auto pr-1">
        {candidates.map((c, index) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedCandidate(c)}
            className={`flex items-center justify-between rounded-md border px-3 py-2 text-left ${
              selectedCandidate?.id === c.id
                ? "border-brand-primary bg-brand-primary/5"
                : "border-transparent hover:bg-[var(--surface-sunken)]"
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--surface-sunken)] text-[10px] font-semibold text-[var(--text-tertiary)]">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="truncate font-mono text-xs font-medium text-[var(--text-primary)]">
                  {c.id}
                </div>
                <div className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                  {c.selector}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-xs font-medium text-[var(--text-secondary)]">
                {(c.score * 100).toFixed(0)}%
              </span>
              <BandBadge band={c.band} />
            </div>
          </button>
        ))}
      </div>

      {selectedCandidate && (
        <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-sunken)] p-4">
          <h4 className="mb-3 text-[11px] font-medium text-[var(--text-secondary)]">
            Candidate inspector
          </h4>

          <div className="mb-4 grid grid-cols-2 gap-3">
            {Object.entries(selectedCandidate.signals).map(([sig, val]) => (
              <div key={sig} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="capitalize text-[var(--text-tertiary)]">
                    {sig}
                  </span>
                  <span className="font-mono font-medium text-[var(--text-secondary)]">
                    {(val * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border-default)]">
                  <div
                    style={{ width: `${val * 100}%` }}
                    className={`h-full rounded-full ${
                      val >= 0.7
                        ? "bg-emerald-500"
                        : val >= 0.5
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <h5 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
              Structural anchors
            </h5>
            <div className="max-h-40 overflow-y-auto rounded bg-[var(--surface-panel)] p-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
              {selectedCandidate.anchors &&
              Object.keys(selectedCandidate.anchors).length > 0 ? (
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(selectedCandidate.anchors, null, 2)}
                </pre>
              ) : (
                <span className="italic text-[var(--text-tertiary)]">
                  No anchors recorded for this candidate.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
