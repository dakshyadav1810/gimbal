import type { Tier1Target } from "@gimbal/shared";
import type { DomCandidate, PageContext, SignalStrategy } from "../base.js";
import { spatialLabelScore } from "./spatial.js";

function jaccard(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// "is it in the right place?" — ancestor chain + region + nearby-text Jaccard + spatial label (LLD-004 §3)
export class ContextSignal implements SignalStrategy {
  readonly name = "context" as const;

  score(target: Tier1Target, cand: DomCandidate, ctx: PageContext): number {
    let score = 0.5; // neutral prior when there's no strong contextual evidence either way
    if (ctx.hasForm && cand.region === "form") score += 0.2;
    if (ctx.hasModal && cand.region === "modal") score += 0.2;
    if (cand.nearbyText) {
      const textMatch = Math.max(
        jaccard(cand.nearbyText, target.label),
        jaccard(cand.nearbyText, target.intent),
      );
      score += textMatch * 0.3;
    }
    // Content this candidate reveals when activated (aria-controls/aria-owns target), if already
    // mounted in the DOM — e.g. a dropdown's menu items. Only meaningful when it's present, so it's
    // a smaller bonus term rather than folded into the nearbyText weight above.
    if (cand.controlledContent) {
      const revealMatch = Math.max(
        jaccard(cand.controlledContent, target.label),
        jaccard(cand.controlledContent, target.intent),
      );
      score += revealMatch * 0.2;
    }

    // Spatial proximity: nearest text node in the label quadrant (above/left of the element).
    // Complements nearbyText (which is ancestor-traversal) with geometric positioning.
    const spatial = spatialLabelScore(target, cand);
    if (spatial > 0) score += spatial * 0.15;

    return Math.min(1, score);
  }
}
