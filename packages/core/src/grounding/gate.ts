import type {
  Band,
  Candidate,
  GroundedResolution,
  Resolution,
} from "@gimbal/shared";
import { cssEscape } from "./selector-escape.js";

export function accept(band: Band): boolean {
  return band !== "low";
}

// Most durable locator, in priority order: data-testid -> stable id -> unique CSS -> role+name (LLD-003 §6).
// Both anchors are live DOM values (e.g. React useId() ids contain `:`), so they must be
// CSS-escaped before interpolation — raw values can produce invalid selectors or, for values
// containing `"`, break out of the attribute-value string and change what the selector matches.
export function durableSelector(winner: Candidate): string {
  if (winner.anchors.testId)
    return `[data-testid="${cssEscape(winner.anchors.testId)}"]`;
  if (winner.anchors.attributes?.id)
    return `#${cssEscape(winner.anchors.attributes.id)}`;
  return winner.selector;
}

// Pure: winner-only GroundedResolution. Caller persists the cache entry (LLD-007) — kept out of here
// so this stays a pure function like the resolver.
export function withCachedSelector(resolution: Resolution): GroundedResolution {
  const winner =
    resolution.candidates.find((c) => c.id === resolution.selected) ?? null;
  return {
    status: resolution.status,
    confidence: resolution.confidence,
    band: resolution.band,
    selected: resolution.selected,
    cachedSelector: winner ? durableSelector(winner) : null,
    winner,
  };
}

export function toWinnerOnly(resolution: Resolution): GroundedResolution {
  return {
    ...withCachedSelector(resolution),
    status: "ungrounded",
    selected: null,
    cachedSelector: null,
    winner: null,
  };
}
