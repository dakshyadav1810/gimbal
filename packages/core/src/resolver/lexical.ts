import type { DomCandidate } from "./base.js";

// Shared by structure.ts's structural bonus and banding.ts's tiebreak cascade.
//
// Rewards a candidate whose id/name attributes lexically resemble the target's own label — e.g.
// "Confirm Password" -> id="password-confirm" should score higher than id="password" alone.
//
// IMPORTANT: this is Jaccard similarity over the FULL label word set against the FULL id/name
// token set, not a "does it contain the distinguishing word" check. An earlier version checked
// only the label's leading modifier word(s) (e.g. "confirm" in "Confirm Password") in an
// all-or-nothing way, which breaks down with 3+ related fields: a "New Password" target and a
// sibling "Confirm New Password" field can BOTH contain "new" in their name attribute
// (name="new_password" vs name="confirm_new_password"), so an inclusion-only check ties them and
// aborts the tiebreak. Jaccard similarity fixes this because it penalizes the EXTRA, non-matching
// tokens a superset match drags in ("confirm" isn't in the target label), giving the more
// precisely-matching candidate ("new_password", fewer extra tokens) a strictly higher score.
function labelWords(label: string): Set<string> {
  return new Set(
    label
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function nameIdTokens(cand: DomCandidate): Set<string> {
  const raw =
    `${cand.attributes?.id ?? ""} ${cand.attributes?.name ?? ""}`.toLowerCase();
  return new Set(raw.split(/[^a-z0-9]+/).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Reward-only input for structure.ts — 0 when the label is a single word (nothing to compare
// beyond the shared role/type, which other terms already cover) or the candidate has no id/name.
export function nameIdLabelSimilarity(
  label: string,
  cand: DomCandidate,
): number {
  const words = labelWords(label);
  if (words.size < 2) return 0;
  return jaccard(words, nameIdTokens(cand));
}

// Tiebreak helper: returns the candidate with a STRICTLY higher nameIdLabelSimilarity than every
// other tied candidate, or null if there's no unique best (including "nobody matches at all").
export function uniqueBestNameIdMatch<T extends { candidate: DomCandidate }>(
  label: string,
  tied: T[],
): T | null {
  const scored = tied
    .map((t) => ({ t, sim: nameIdLabelSimilarity(label, t.candidate) }))
    .filter((s) => s.sim > 0);
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.sim - a.sim);
  if (scored.length === 1) return scored[0].t;
  return scored[0].sim > scored[1].sim ? scored[0].t : null;
}
