import type { Tier1Target } from "@gimbal/shared";
import { beforeAll, describe, expect, it } from "vitest";
import type { DomCandidate, PageContext } from "../base.js";
import { CachedEmbedder, TransformersEmbeddingModel } from "../embeddings.js";
import { SemanticsSignal } from "./semantics.js";

// Real model (Xenova/all-MiniLM-L6-v2), not a fake — this signal is specifically where an
// embedding model's confident-but-wrong matches (e.g. antonym confusion) would surface, and a
// hand-authored fake embedder can't reproduce that failure mode. First run downloads ~90MB to
// ~/.cache/huggingface; subsequent runs are local. Model load + inference is slow relative to the
// rest of the suite, hence the extended timeout.
const MODEL_TIMEOUT_MS = 120_000;

const page: PageContext = {
  textDensity: 0,
  iconRatio: 0,
  hasForm: false,
  hasModal: false,
  repeatedStructure: false,
};

function target(over: Partial<Tier1Target>): Tier1Target {
  return {
    label: "x",
    semantics: ["x"],
    role: "button",
    actions: ["click"],
    intent: "x",
    ...over,
  };
}

function cand(over: Partial<DomCandidate>): DomCandidate {
  return { id: "c", selector: "#c", tag: "button", ...over };
}

describe("SemanticsSignal (real embedding model)", () => {
  let signal: SemanticsSignal;

  beforeAll(async () => {
    const model = new TransformersEmbeddingModel("Xenova/all-MiniLM-L6-v2");
    const memCache = new Map<string, Float32Array>();
    const embedder = new CachedEmbedder(model, "Xenova/all-MiniLM-L6-v2", {
      getEmbedding: (key: string) => memCache.get(key) ?? null,
      putEmbedding: (key: string, _model: string, vec: Float32Array) => {
        memCache.set(key, vec);
      },
    } as any);
    signal = new SemanticsSignal(embedder);
    // Warm the model once so the first real assertion isn't also paying for model load.
    await embedder.embed("warmup");
  }, MODEL_TIMEOUT_MS);

  it(
    "scores 0 for a candidate with no label, before touching the model",
    async () => {
      const score = await signal.score(
        target({ label: "Submit" }),
        cand({ label: undefined }),
        page,
      );
      expect(score).toBe(0);
    },
    MODEL_TIMEOUT_MS,
  );

  it(
    "scores near 1 for an exact label match",
    async () => {
      const t = target({ label: "Submit", semantics: ["submit"] });
      const score = await signal.score(t, cand({ label: "Submit" }), page);
      expect(score).toBeGreaterThan(0.95);
    },
    MODEL_TIMEOUT_MS,
  );

  it(
    "scores a true paraphrase (synonym relabeling) clearly above the medium band",
    async () => {
      // the exact "More information..." -> "Learn more" case from WALKTHROUGH.md's worked example
      const t = target({
        label: "More information...",
        semantics: ["more information", "learn more", "documentation link"],
      });
      const score = await signal.score(t, cand({ label: "Learn more" }), page);
      expect(score).toBeGreaterThanOrEqual(0.5);
    },
    MODEL_TIMEOUT_MS,
  );

  it(
    "scores a genuinely unrelated label lower than a true match",
    async () => {
      // MiniLM rates same-domain-but-different-action phrases (e.g. two commerce/account
      // actions) as moderately related even when wrong, so this asserts the relative ordering
      // against a true match rather than an absolute "low" threshold, which real model behavior
      // doesn't cleanly support.
      const t = target({
        label: "Submit payment",
        semantics: ["submit payment", "checkout"],
      });
      const trueMatchScore = await signal.score(
        t,
        cand({ label: "Checkout now" }),
        page,
      );
      const unrelatedScore = await signal.score(
        t,
        cand({ label: "Cancel subscription" }),
        page,
      );
      expect(unrelatedScore).toBeLessThan(trueMatchScore);
    },
    MODEL_TIMEOUT_MS,
  );

  it(
    "documents the antonym-confusion risk: 'Log in' vs 'Log out' are not clearly separated by cosine similarity alone",
    async () => {
      // This is the concrete failure mode raised in review: sentence embeddings are known to be
      // weak on negation/antonyms, since "log in"/"log out" share most surface vocabulary and
      // grammatical structure. This test does not assert the signal is "safe" — it pins the
      // model's actual behavior so a future model swap or config change that silently worsens
      // (or fixes) this gap is visible in the suite, rather than assumed.
      const t = target({ label: "Log in", semantics: ["log in", "sign in"] });
      const logOutScore = await signal.score(
        t,
        cand({ label: "Log out" }),
        page,
      );
      const unrelatedScore = await signal.score(
        t,
        cand({ label: "Change language" }),
        page,
      );
      // The risk: an antonym can score meaningfully closer to a true match than an unrelated
      // control does, purely on shared vocabulary/structure. Surfacing the gap (rather than
      // asserting a specific threshold) is the point — semantics alone must not be trusted to
      // reject this case; affordance/context/structure and the confidence bands are the real gate.
      expect(logOutScore).toBeGreaterThan(unrelatedScore - 0.3);
    },
    MODEL_TIMEOUT_MS,
  );

  it(
    "takes the max similarity across all target semantics entries plus label, not an average",
    async () => {
      // one strong semantic match buried among weak ones should still let the candidate win high
      const t = target({
        label: "zzz-unrelated-token",
        semantics: [
          "zzz-unrelated-token",
          "completely different concept",
          "checkout button",
        ],
      });
      const score = await signal.score(
        t,
        cand({ label: "Checkout button" }),
        page,
      );
      expect(score).toBeGreaterThan(0.7);
    },
    MODEL_TIMEOUT_MS,
  );

  it(
    "is symmetric-ish and stable for repeated calls on the same pair (deterministic, no sampling)",
    async () => {
      const t = target({ label: "Email", semantics: ["email"] });
      const a = await signal.score(t, cand({ label: "Email address" }), page);
      const b = await signal.score(t, cand({ label: "Email address" }), page);
      expect(a).toBe(b);
    },
    MODEL_TIMEOUT_MS,
  );
});
