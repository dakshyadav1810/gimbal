import type { CandidatesDoc } from "@gimbal/shared";

export interface UngroundedStepSummary {
  stepId: string;
  reason: string;
  topCandidates: Array<{ label?: string; selector: string; score: number }>;
}

// Turns a raw CandidatesDoc into the human-readable "why" an agent otherwise has to
// reconstruct by diffing candidate scores itself. Ambiguity (two+ candidates close in score,
// no deterministic tiebreak) is the common case worth naming explicitly; anything else falls
// back to a generic low-confidence message.
export function summarizeUngrounded(
  doc: CandidatesDoc,
): UngroundedStepSummary[] {
  const out: UngroundedStepSummary[] = [];
  for (const step of doc.steps) {
    const { resolution } = step;
    if (resolution.status === "grounded") continue;

    const ranked = [...resolution.candidates].sort((a, b) => b.score - a.score);
    const [top, runnerUp] = ranked;
    const topCandidates = ranked.slice(0, 3).map((c) => ({
      label: c.label,
      selector: c.selector,
      score: c.score,
    }));

    let reason: string;
    if (!top) {
      reason = "no candidate matched this target at all";
    } else if (resolution.selected === null && runnerUp) {
      reason = `ambiguous — top two candidates tied at ${top.score.toFixed(2)} ("${top.label ?? top.selector}") vs ${runnerUp.score.toFixed(2)} ("${runnerUp.label ?? runnerUp.selector}"); add a disambiguator (nearby text, index) or a looser generalization`;
    } else {
      reason = `low confidence — best match "${top.label ?? top.selector}" only scored ${top.score.toFixed(2)}`;
    }

    out.push({ stepId: step.stepId, reason, topCandidates });
  }
  return out;
}
