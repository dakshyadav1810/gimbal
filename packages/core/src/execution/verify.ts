import type {
  EffectFingerprint,
  Repair,
  UiStep,
} from "@gimbal/shared";
import type { DomCandidate } from "../resolver/base.js";

const MAX_KEYS = 10;

// Digits become "#" so badge counts, timestamps and generated ids don't make two runs of the same
// UI look different.
function norm(s: string): string {
  return s.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 60);
}

function normPath(url: string): string {
  try {
    return new URL(url).pathname.replace(/[0-9a-f]{8,}|\d+/gi, ":id");
  } catch {
    return url;
  }
}

function keysOf(cands: DomCandidate[], skipLabel?: string): Set<string> {
  const skip = skipLabel ? norm(skipLabel) : null;
  return new Set(
    cands
      .filter((c) => c.label && norm(c.label) !== skip)
      .map((c) => `${c.role ?? c.tag}:${norm(c.label as string)}`),
  );
}

export function computeEffect(
  before: DomCandidate[],
  after: DomCandidate[],
  urlBefore: string,
  urlAfter: string,
  // The acted-on element is left out: its own label is exactly what a heal may have changed.
  actedLabel?: string,
): EffectFingerprint {
  const b = keysOf(before, actedLabel);
  const a = keysOf(after, actedLabel);
  const top = (xs: string[]) => xs.sort().slice(0, MAX_KEYS);
  const urlPathChanged = normPath(urlBefore) !== normPath(urlAfter);
  return {
    urlPathChanged,
    ...(urlPathChanged ? { toPath: normPath(urlAfter) } : {}),
    appeared: top([...a].filter((k) => !b.has(k))),
    disappeared: top([...b].filter((k) => !a.has(k))),
  };
}

function jaccard(x: string[], y: string[]): number {
  const sx = new Set(x);
  const sy = new Set(y);
  const inter = [...sx].filter((k) => sy.has(k)).length;
  const union = new Set([...sx, ...sy]).size;
  return union === 0 ? 1 : inter / union;
}

type Verification = NonNullable<Repair["verification"]>;

export function compareEffect(
  expected: EffectFingerprint,
  actual: EffectFingerprint,
): Pick<Verification, "result" | "detail"> {
  if (expected.urlPathChanged !== actual.urlPathChanged) {
    return {
      result: "mismatch",
      detail: expected.urlPathChanged
        ? `grounding navigated to ${expected.toPath}, the healed action did not navigate`
        : `the healed action navigated to ${actual.toPath}, grounding did not`,
    };
  }
  if (expected.urlPathChanged && expected.toPath !== actual.toPath) {
    return {
      result: "mismatch",
      detail: `navigated to ${actual.toPath}, expected ${expected.toPath}`,
    };
  }
  // Same navigation target on both sides is strong evidence on its own; after a page change the
  // appeared/disappeared sets are mostly the whole page and add noise.
  if (expected.urlPathChanged) return { result: "verified" };
  const seen = expected.appeared.length ? "appeared" : "disappeared";
  const exp = expected[seen];
  if (exp.length === 0) {
    // Nothing observable happened at grounding either: can't tell a right click from a wrong one.
    return { result: "inconclusive", detail: "grounding observed no effect for this step" };
  }
  const score = jaccard(exp, actual[seen]);
  return score >= 0.5
    ? { result: "verified" }
    : {
        result: "mismatch",
        detail: `elements that ${seen} after the action overlap ${Math.round(score * 100)}% with grounding`,
      };
}

// Level order: the author's own outcome/assertions > grounding-time effect > nothing.
export function verifyHeal(opts: {
  step: UiStep;
  effect?: EffectFingerprint;
  outcomeFailed: boolean;
  before: DomCandidate[];
  after: DomCandidate[];
  urlBefore: string;
  urlAfter: string;
  actedLabel?: string;
}): Verification {
  if (opts.step.expectedOutcome.length > 0 || opts.step.assertions.length > 0) {
    return opts.outcomeFailed
      ? { level: "outcome", result: "mismatch", detail: "the step's expected outcome or assertion failed after the healed action" }
      : { level: "outcome", result: "verified" };
  }
  if (opts.effect) {
    const actual = computeEffect(
      opts.before,
      opts.after,
      opts.urlBefore,
      opts.urlAfter,
      opts.actedLabel,
    );
    return { level: "effect", ...compareEffect(opts.effect, actual) };
  }
  return { level: "none", result: "inconclusive", detail: "no outcome or recorded effect to check against" };
}
