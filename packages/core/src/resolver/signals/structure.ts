import type { Tier1Target } from "@gimbal/shared";
import type { DomCandidate, PageContext, SignalStrategy } from "../base.js";
import { nameIdLabelSimilarity } from "../lexical.js";

const ROLE_SYNONYMS: Record<string, string[]> = {
  button: ["button", "submit"],
  textbox: ["textbox", "input"],
  link: ["link", "a"],
};

// input[type] families implied by an action, for the reward-only check below.
const TEXT_ENTRY_TYPES = [
  "text",
  "email",
  "password",
  "tel",
  "url",
  "search",
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "color",
];
const TOGGLE_TYPES = ["checkbox", "radio"];

function expectedTypeFamily(actions: string[]): string[] | null {
  if (actions.includes("type") || actions.includes("fill"))
    return TEXT_ENTRY_TYPES;
  if (actions.includes("check") || actions.includes("toggle"))
    return TOGGLE_TYPES;
  return null;
}

// The cheap, id-anchored xpath form (`//*[@id="..."]`) survives DOM reshuffles; the positional
// fallback form (sibling-index based) doesn't — only the former earns the structural bonus.
const ID_ANCHORED_XPATH = /^\/\/\*\[@id=/;

// "can we identify it by what it is?" — structural identity, formerly "selector" (LLD-004 §3)
export class StructureSignal implements SignalStrategy {
  readonly name = "structure" as const;

  score(target: Tier1Target, cand: DomCandidate, _ctx: PageContext): number {
    if (cand.testId) return 1; // data-testid is the strongest structural anchor

    let score = 0;
    if (cand.attributes?.id) score += 0.3;

    const wantRole = target.role.toLowerCase();
    const gotRole = cand.role?.toLowerCase();
    if (gotRole === wantRole) score += 0.4;
    else if (ROLE_SYNONYMS[wantRole]?.includes(gotRole ?? "")) score += 0.3;
    else if (ROLE_SYNONYMS[wantRole]?.includes(cand.tag)) score += 0.2;

    if (cand.xpath && ID_ANCHORED_XPATH.test(cand.xpath)) score += 0.15;
    if (cand.contextPath && cand.contextPath.length > 0) score += 0.15;

    // Reward-only (never penalizes a mismatch, so cases without a `type` attribute are unaffected):
    // a candidate whose input[type] matches the family implied by the target's own action.
    const family = expectedTypeFamily(target.actions);
    const gotType = cand.attributes?.type?.toLowerCase();
    if (family && gotType && family.includes(gotType)) score += 0.1;

    // Jaccard similarity between the target's label words and the candidate's id/name tokens (see
    // resolver/lexical.ts) — proportional, not all-or-nothing, so a candidate whose id/name is an
    // over-broad superset (e.g. "confirm_new_password" for a "New Password" target) scores lower
    // than a tighter match ("new_password"), rather than tying with it.
    score += nameIdLabelSimilarity(target.label, cand) * 0.15;

    return Math.min(1, score);
  }
}
