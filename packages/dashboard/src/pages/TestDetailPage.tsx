import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { api } from "../api.js";
import { JsonEditor } from "../components/JsonEditor.js";
import { useRuns } from "../queries.js";

export function TestDetailPage({ testId }: { testId: string }) {
  const { data: runs } = useRuns(testId);
  const latest = runs?.[0];
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Navigate to the run-detail view immediately: without this, a click on Run had no visible
  // effect even though the run genuinely executed server-side (LLD-010 §3.3 tracks it live).
  const run = async () => {
    const { runId } = await api.runTest(testId);
    queryClient.invalidateQueries({ queryKey: ["tests", testId, "runs"] });
    setLocation(`/tests/${testId}/runs/${runId}`);
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{testId}</h1>
        <div className="flex items-center gap-3">
          <Link
            href={`/tests/${testId}/runs`}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Run history
          </Link>
          <button
            type="button"
            onClick={run}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Run
          </button>
        </div>
      </div>
      {latest && (
        <div className="mb-4 text-sm text-neutral-500">
          Latest run:{" "}
          <Link
            href={`/tests/${testId}/runs/${latest.runId}`}
            className="text-neutral-700 underline dark:text-neutral-300"
          >
            {latest.status}
          </Link>{" "}
          at {new Date(latest.startedAt).toLocaleString()}
        </div>
      )}
      <JsonEditor testId={testId} />
    </div>
  );
}
