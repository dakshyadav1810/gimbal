import type { Candidate } from "@gimbal/shared";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Screenshot } from "../components/Screenshot.js";
import { useTestReviews } from "../queries.js";

const BAND_STYLES: Record<string, string> = {
  high: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  medium:
    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  low: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
};

export function ReviewDetailPage({
  testId,
  stepId,
}: {
  testId: string;
  stepId: string;
}) {
  const { data: reviews } = useTestReviews(testId);
  const review = reviews?.find((r) => r.stepId === stepId);
  const [copied, setCopied] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(
    null,
  );

  useEffect(() => {
    setCopied(false);
    setSelectedCandidate(null);
  }, [testId, stepId]);

  const candidates: Candidate[] = review?.candidatesJson
    ? (JSON.parse(review.candidatesJson) as Candidate[])
    : [];

  // Set default selected candidate on load
  useEffect(() => {
    if (candidates.length > 0 && !selectedCandidate) {
      setSelectedCandidate(candidates[0]);
    }
  }, [candidates, selectedCandidate]);

  const copyForAgent = async () => {
    const repairPayload = await api.getRepairPayload(testId);
    const text = `This Gimbal test step is stale and needs repair. Fix the target/spec and call the \`updateTest\` MCP tool with testId=${testId} and the corrected spec.\n\n${JSON.stringify(repairPayload, null, 2)}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      {/* Title Header */}
      <section className="mb-8">
        <span className="font-mono text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
          Review Session
        </span>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          Stale Step: {testId} / {stepId}
        </h1>
        {review && (
          <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            Last seen on:{" "}
            <a
              href={review.url}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-brand-primary"
            >
              {review.url}
            </a>
          </p>
        )}
      </section>

      {/* Side-by-Side Panel Grid */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left Panel: Screenshot & Agent Copy Instructions */}
        <section className="flex flex-col gap-6">
          <div className="glass-panel overflow-hidden rounded-2xl p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-500">
              failing page state
            </h3>
            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-sm bg-neutral-100 dark:bg-neutral-900">
              <Screenshot
                path={review?.screenshotPath}
                alt={`${stepId} failing snapshot`}
              />
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
              Heal with Coding Agent
            </h3>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
              Gimbal runs locally and LLM-free. To repair this stale element,
              copy the repair context payload and hand it to your connected
              agent (e.g. Claude Code or Cursor) to re-author the spec.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={copyForAgent}
                className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200 shadow-sm transition-all duration-200"
              >
                {copied ? "✓ Context Copied" : "Copy Repair Context"}
              </button>
            </div>
          </div>
        </section>

        {/* Right Panel: Ranked Candidates Explorer */}
        <section className="flex flex-col gap-6">
          <div className="glass-panel rounded-2xl p-6 shadow-sm flex-1 flex flex-col">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-neutral-500">
              Ranked DOM Candidates
            </h3>

            {candidates.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
                <span className="text-xl">🔍</span>
                <p className="mt-2 text-xs text-neutral-400 text-center">
                  No interactive candidates matched the resolver gate on this
                  page.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4">
                {/* Candidates List */}
                <div className="max-h-60 overflow-y-auto pr-1 flex flex-col gap-2">
                  {candidates.map((c, index) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCandidate(c)}
                      className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all duration-200 ${
                        selectedCandidate?.id === c.id
                          ? "bg-brand-primary/5 dark:bg-indigo-950/20 border-brand-primary dark:border-indigo-500"
                          : "bg-white/40 dark:bg-neutral-900/30 border-neutral-200 dark:border-neutral-850 hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-900 text-xs font-bold text-neutral-500">
                          {index + 1}
                        </span>
                        <div>
                          <div className="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200">
                            {c.id}
                          </div>
                          <div className="text-xs text-neutral-400 truncate max-w-xs sm:max-w-sm font-mono mt-0.5">
                            {c.selector}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-neutral-700 dark:text-neutral-350">
                          {(c.score * 100).toFixed(0)}%
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${BAND_STYLES[c.band]}`}
                        >
                          {c.band}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Selected Candidate Inspector */}
                {selectedCandidate && (
                  <div className="flex-1 rounded-xl border border-neutral-200/80 dark:border-neutral-900 bg-neutral-50/50 dark:bg-neutral-950/30 p-5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">
                      Candidate Inspector
                    </h4>

                    {/* Signal Progress Meters */}
                    <div className="grid grid-cols-2 gap-4 mb-5">
                      {Object.entries(selectedCandidate.signals).map(
                        ([sig, val]) => (
                          <div key={sig} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="capitalize text-neutral-400">
                                {sig}
                              </span>
                              <span className="font-mono font-semibold text-neutral-600 dark:text-neutral-400">
                                {(val * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-900 overflow-hidden">
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
                        ),
                      )}
                    </div>

                    {/* Structural Anchors details */}
                    <div>
                      <h5 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                        Structural Anchors
                      </h5>
                      <div className="max-h-40 overflow-y-auto rounded-lg bg-neutral-950 p-3 font-mono text-[11px] text-indigo-300 leading-relaxed">
                        {selectedCandidate.anchors &&
                        Object.keys(selectedCandidate.anchors).length > 0 ? (
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(selectedCandidate.anchors, null, 2)}
                          </pre>
                        ) : (
                          <div className="text-neutral-500 italic">
                            No anchors recorded for this candidate.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
