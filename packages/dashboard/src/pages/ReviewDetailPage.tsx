import { useEffect, useState } from "react";
import { api } from "../api.js";
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

  const candidates = review?.candidatesJson
    ? (JSON.parse(review.candidatesJson) as unknown[])
    : [];

  const copyForAgent = async () => {
    const repairPayload = await api.getRepairPayload(testId);
    const text = `This Gimbal test step is stale and needs repair. Fix the target/spec and call the \`updateTest\` MCP tool with testId=${testId} and the corrected spec.\n\n${JSON.stringify(repairPayload, null, 2)}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold">
        Review — {testId} / {stepId}
      </h1>
      {review && (
        <p className="mb-4 text-sm text-neutral-500">{review.url}</p>
      )}

      <div className="mb-4 max-w-md">
        <Screenshot
          path={review?.screenshotPath}
          alt={`${stepId} screenshot`}
        />
      </div>

      <h2 className="mb-2 text-sm font-medium text-neutral-500">
        Ranked candidates
      </h2>
      {candidates.length === 0 ? (
        <p className="mb-4 text-sm text-neutral-500">No candidates recorded.</p>
      ) : (
        <pre className="mb-4 max-h-64 overflow-auto rounded border border-neutral-200 p-2 text-xs dark:border-neutral-800">
          {JSON.stringify(candidates, null, 2)}
        </pre>
      )}

      <button
        type="button"
        onClick={copyForAgent}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        {copied ? "Copied" : "Copy for agent"}
      </button>
      <p className="mt-2 text-xs text-neutral-400">
        Read-only — Gimbal never calls a model to author a fix. Paste this into your connected
        agent session.
      </p>
    </div>
  );
}
