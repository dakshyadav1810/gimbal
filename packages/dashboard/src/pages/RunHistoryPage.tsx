import { Link } from "wouter";
import { useRuns } from "../queries.js";

const STATUS_STYLE: Record<string, string> = {
  passed: "text-green-700 dark:text-green-400",
  failed: "text-red-700 dark:text-red-400",
};

export function RunHistoryPage({ testId }: { testId: string }) {
  const { data: runs, isLoading } = useRuns(testId);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Run history — {testId}</h1>
      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {runs?.length === 0 && (
        <p className="text-sm text-neutral-500">No runs yet.</p>
      )}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
            <th className="py-1.5 pr-4 font-medium">status</th>
            <th className="py-1.5 pr-4 font-medium">review</th>
            <th className="py-1.5 pr-4 font-medium">started</th>
            <th className="py-1.5 pr-4 font-medium">finished</th>
          </tr>
        </thead>
        <tbody>
          {runs?.map((r) => (
            <tr
              key={r.runId}
              className="border-b border-neutral-100 dark:border-neutral-900"
            >
              <td className="py-1.5 pr-4">
                <Link
                  href={`/tests/${testId}/runs/${r.runId}`}
                  className={`font-medium underline ${STATUS_STYLE[r.status] ?? ""}`}
                >
                  {r.status}
                </Link>
              </td>
              <td className="py-1.5 pr-4">
                {r.needsReview ? "needs review" : "—"}
              </td>
              <td className="py-1.5 pr-4">
                {new Date(r.startedAt).toLocaleString()}
              </td>
              <td className="py-1.5 pr-4">
                {new Date(r.finishedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
