import type { Candidate } from "@gimbal/shared";
import { Check, Clipboard } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ResolutionPanel } from "../components/ResolutionPanel.js";
import { Screenshot } from "../components/Screenshot.js";
import { useTestReviews } from "../queries.js";

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

  useEffect(() => {
    setCopied(false);
  }, [testId, stepId]);

  const candidates: Candidate[] = review?.candidatesJson
    ? (JSON.parse(review.candidatesJson) as Candidate[])
    : [];

  const copyForAgent = async () => {
    const repairPayload = await api.getRepairPayload(testId);
    const text = `This Gimbal test step is stale and needs repair. Fix the target/spec and call the \`updateTest\` MCP tool with testId=${testId} and the corrected spec.\n\n${JSON.stringify(repairPayload, null, 2)}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <section className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Stale Step
        </h1>
        <p className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">
          {testId} / {stepId}
        </p>
        {review && (
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            Last seen on{" "}
            <a
              href={review.url}
              target="_blank"
              rel="noreferrer"
              className="text-brand-primary hover:underline"
            >
              {review.url}
            </a>
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-6">
          <div className="panel overflow-hidden p-4">
            <h3 className="mb-3 text-xs font-medium text-[var(--text-secondary)]">
              Failing page state
            </h3>
            <div className="overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-sunken)]">
              <Screenshot
                path={review?.screenshotPath}
                alt={`${stepId} failing snapshot`}
              />
            </div>
          </div>

          <div className="panel p-5">
            <h3 className="text-xs font-medium text-[var(--text-secondary)]">
              Heal with coding agent
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-tertiary)]">
              Gimbal runs locally and LLM-free. To repair this stale element,
              copy the repair context payload and hand it to your connected
              agent (e.g. Claude Code or Cursor) to re-author the spec.
            </p>
            <button
              type="button"
              onClick={copyForAgent}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-primary-hover"
            >
              {copied ? <Check size={13} /> : <Clipboard size={13} />}
              {copied ? "Context copied" : "Copy repair context"}
            </button>
          </div>
        </section>

        <section className="panel flex flex-col p-5">
          <h3 className="mb-4 text-xs font-medium text-[var(--text-secondary)]">
            Ranked DOM candidates
          </h3>
          <ResolutionPanel candidates={candidates} />
        </section>
      </div>
    </main>
  );
}
