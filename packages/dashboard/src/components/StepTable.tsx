import type { StepResult } from "@gimbal/shared";
import { Screenshot } from "./Screenshot.js";

const STATUS_STYLE: Record<StepResult["status"], string> = {
  passed: "text-green-700 dark:text-green-400",
  failed: "text-red-700 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  skipped: "text-neutral-500",
  stale: "text-amber-700 dark:text-amber-400",
};

export function StepTable({
  steps,
  showScreenshots = false,
}: {
  steps: StepResult[];
  showScreenshots?: boolean;
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
          <th className="py-1.5 pr-4 font-medium">step</th>
          <th className="py-1.5 pr-4 font-medium">status</th>
          <th className="py-1.5 pr-4 font-medium">selection</th>
          <th className="py-1.5 pr-4 font-medium">band</th>
          <th className="py-1.5 pr-4 font-medium">ms</th>
          {showScreenshots && (
            <th className="py-1.5 pr-4 font-medium">screenshot</th>
          )}
        </tr>
      </thead>
      <tbody>
        {steps.map((s) => (
          <tr
            key={s.stepId}
            className="border-b border-neutral-100 dark:border-neutral-900"
          >
            <td className="py-1.5 pr-4">{s.stepId}</td>
            <td className={`py-1.5 pr-4 font-medium ${STATUS_STYLE[s.status]}`}>
              {s.status}
            </td>
            <td className="py-1.5 pr-4">{s.selection ?? "—"}</td>
            <td className="py-1.5 pr-4">{s.band ?? "—"}</td>
            <td className="py-1.5 pr-4">{s.durationMs}</td>
            {showScreenshots && (
              <td className="py-1.5 pr-4">
                <div className="w-40">
                  <Screenshot path={s.screenshot} alt={`${s.stepId} screenshot`} />
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
