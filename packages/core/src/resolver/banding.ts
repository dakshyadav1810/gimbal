import type {
  Band,
  Generalization,
  GimbalConfig,
  Tier1Target,
} from "@gimbal/shared";
import type { DomCandidate } from "./base.js";
import { uniqueBestNameIdMatch } from "./lexical.js";

export const CONFIDENCE_MARGIN = 0.15;

export function toBand(score: number, bands: GimbalConfig["bands"]): Band {
  if (score >= bands.high) return "high";
  if (score >= bands.medium) return "medium";
  return "low";
}

export interface Scored {
  candidate: DomCandidate;
  score: number;
}

// Winner must lead the runner-up by CONFIDENCE_MARGIN under strict generalizations; otherwise
// deterministic tiebreakers apply. Persistent ambiguity downgrades the band rather than guessing (LLD-004 §6).
export function selectBest(
  scored: Scored[],
  generalization: Generalization,
  bands: GimbalConfig["bands"],
  target?: Tier1Target,
): { winner: Scored | null; band: Band; ambiguous: boolean } {
  if (scored.length === 0)
    return { winner: null, band: "low", ambiguous: false };

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const runnerUp = sorted[1];
  const requiresMargin =
    generalization === "same_element" || generalization === "any_matching";
  const margin =
    generalization === "same_element"
      ? CONFIDENCE_MARGIN
      : CONFIDENCE_MARGIN / 2;

  let band = toBand(top.score, bands);
  let ambiguous = false;

  if (requiresMargin && runnerUp && top.score - runnerUp.score < margin) {
    const tiebreakWinner = tiebreak(
      sorted.filter((s) => top.score - s.score < margin),
      target,
    );
    if (tiebreakWinner) {
      return {
        winner: tiebreakWinner,
        band: toBand(tiebreakWinner.score, bands),
        ambiguous: false,
      };
    }
    ambiguous = true;
    band = band === "high" ? "medium" : "low"; // downgrade rather than guess
  }

  return { winner: top, band, ambiguous };
}

// Deterministic cascade: durable anchor -> id/name lexical similarity to the label -> sibling
// index (same parent only) -> DOM order.
function tiebreak(tied: Scored[], target?: Tier1Target): Scored | null {
  const withTestId = tied.find((s) => s.candidate.testId);
  if (withTestId) return withTestId;

  // The tied candidate whose id/name is a STRICTLY closer lexical match to the target's label than
  // every other tied candidate (Jaccard similarity, resolver/lexical.ts — not a plain "contains"
  // check, so an over-broad superset match, e.g. name="confirm_new_password" for a "New Password"
  // target, doesn't tie with the tighter "new_password" match). This is the deterministic-tiebreak
  // equivalent of structure.ts's reward-only bonus, for cases where the score gap alone isn't
  // enough to clear CONFIDENCE_MARGIN (near-duplicate fields whose OTHER signals are already
  // near-saturated, e.g. multiple password inputs in the same form).
  if (target) {
    const winner = uniqueBestNameIdMatch(target.label, tied);
    if (winner) return winner;
  }

  // siblingIndex is only meaningful when the tied candidates share an immediate parent — it's
  // computed per-parent (dom-extractor.ts), so e.g. two unrelated header buttons in different
  // containers both come back as siblingIndex 0. Comparing across parents isn't a tiebreak, it's
  // a coincidence: it silently picked whichever candidate the extractor happened to visit first,
  // with no ambiguity flag raised (this shipped a theme-toggle button as a profile-menu trigger).
  // parentXpath (the parent's own xpath) is used rather than contextPath[0] (tag + optional id)
  // because two unrelated, unid'd wrapper <div>s both collapse to the string "div" — a false match.
  const sameParent = tied.every(
    (s) =>
      s.candidate.parentXpath != null &&
      s.candidate.parentXpath === tied[0].candidate.parentXpath,
  );
  if (sameParent) {
    const withSiblingIndex = [...tied].sort(
      (a, b) =>
        (a.candidate.siblingIndex ?? 99) - (b.candidate.siblingIndex ?? 99),
    );
    if (withSiblingIndex[0]?.candidate.siblingIndex !== undefined)
      return withSiblingIndex[0];
  }

  return null; // genuinely ambiguous — caller downgrades the band
}

// Runtime healing acts on a live app with nothing but this choice to go on, so it is stricter than
// grounding: the winner must clearly beat the runner-up, or match the label clearly better.
// Calibrated on the 45-cell fixture bench (packages/bench/results): wrong picks had margins <= 0.03
// or weak label evidence, correct ones an exact label match.
export const HEAL_MIN_MARGIN = 0.05;
const CLEAR_LABEL_MATCH = 0.95;
const CLEAR_LABEL_LEAD = 0.15;

interface RankedCandidate {
  id: string;
  label?: string;
  score: number;
  signals: { semantics: number };
}

export function healAmbiguity(
  candidates: RankedCandidate[],
  selectedId: string | null,
): string | null {
  const winner = candidates.find((c) => c.id === selectedId);
  const runnerUp = candidates
    .filter((c) => c.id !== selectedId)
    .sort((a, b) => b.score - a.score)[0];
  if (!winner || !runnerUp) return null;
  const margin = winner.score - runnerUp.score;
  if (margin >= HEAL_MIN_MARGIN) return null;
  const clearLabel =
    winner.signals.semantics >= CLEAR_LABEL_MATCH &&
    winner.signals.semantics - runnerUp.signals.semantics >= CLEAR_LABEL_LEAD;
  if (clearLabel) return null;
  return margin < 0
    ? `ambiguous: "${runnerUp.label ?? runnerUp.id}" outscores the chosen candidate`
    : `ambiguous: "${runnerUp.label ?? runnerUp.id}" is within ${margin.toFixed(2)} of the chosen candidate`;
}
