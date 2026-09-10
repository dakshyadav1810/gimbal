import type { Tier1Target } from "@gimbal/shared";
import type { DomCandidate } from "../base.js";

function jaccard(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Geometric label proximity: scores how closely the nearest visible text node
// in the element's label quadrant (above / left) matches the target label.
// Used as a fused term inside the ContextSignal (not a standalone weighted signal).
export function spatialLabelScore(
  target: Tier1Target,
  cand: DomCandidate,
): number {
  if (!cand.spatialLabel) return 0;
  return jaccard(cand.spatialLabel, target.label);
}
