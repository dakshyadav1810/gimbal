import type { Tier1Target } from "@gimbal/shared";
import type { DomCandidate } from "./base.js";

// An element whose accessible name AND role equal the target's, with no other element doing the
// same, is almost always the element the author meant. Embedding similarity is generous (it rates
// "sign in" at 0.90 against a "sign up" target) and structure rewards elements that merely kept
// their id, so on their own they can rank a different button above the exact match. This bonus
// makes the unique exact match win unless something else is genuinely better.
export const EXACT_NAME_BONUS = 0.12;

const norm = (s: string | undefined) =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// The extractor only reports explicit ARIA roles; a plain <button> or <a> has none. Fall back to
// the element's implicit role so "button named X" can be matched against a <button>.
export function effectiveRole(c: DomCandidate): string | undefined {
  if (c.role) return c.role;
  const type = c.attributes?.type?.toLowerCase();
  switch (c.tag) {
    case "button":
      return "button";
    case "a":
      return "link";
    case "select":
      return "combobox";
    case "textarea":
      return "textbox";
    case "input":
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type && ["submit", "button", "reset", "image"].includes(type))
        return "button";
      return "textbox";
    default:
      return undefined;
  }
}

export function uniqueExactNameMatch(
  target: Pick<Tier1Target, "label" | "role">,
  candidates: DomCandidate[],
): DomCandidate | null {
  const label = norm(target.label);
  if (!label) return null;
  const hits = candidates.filter(
    (c) => norm(c.label) === label && effectiveRole(c) === target.role,
  );
  return hits.length === 1 ? hits[0] : null;
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );

// Healing only: a replacement must share words with the target's label or with one of the
// synonyms the author listed. Without this, "Edit Bob" can stand in for a removed "Edit Alice",
// because a sentence-embedding model sees them as nearly the same. A candidate with no label
// (an icon button) cannot be judged here and is left to the other checks.
export function lexicalSupport(
  target: Pick<Tier1Target, "label" | "semantics">,
  candidateLabel: string | undefined,
): boolean {
  if (!candidateLabel?.trim()) return true;
  const cand = words(candidateLabel);
  return [target.label, ...target.semantics].some((s) => {
    const w = words(s);
    let inter = 0;
    for (const x of w) if (cand.has(x)) inter++;
    const union = w.size + cand.size - inter;
    return union > 0 && inter / union >= 0.5;
  });
}
