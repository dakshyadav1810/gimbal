import type { Tier1Target } from "@gimbal/shared";
import { beforeAll, describe, expect, it } from "vitest";
import type { DomCandidate, PageContext } from "./base.js";
import { CachedEmbedder, TransformersEmbeddingModel } from "./embeddings.js";
import { MultiSignalResolver } from "./index.js";

// Full-pipeline cases that specifically need the real embedding model, not the fake bag-of-words
// embedder used in resolver.test.ts — these probe whether structure/context/affordance actually
// correct a semantically-plausible-but-wrong match, which a hand-authored fake can't demonstrate
// either way.
const MODEL_TIMEOUT_MS = 120_000;

const bands = { high: 0.7, medium: 0.5 };
const page: PageContext = {
  textDensity: 0.8,
  iconRatio: 0,
  hasForm: true,
  hasModal: false,
  repeatedStructure: false,
};

function cand(over: Partial<DomCandidate>): DomCandidate {
  return {
    id: "c",
    selector: "#c",
    tag: "input",
    role: "textbox",
    visible: true,
    disabled: false,
    ...over,
  };
}

describe("MultiSignalResolver — real-model integration", () => {
  let resolver: MultiSignalResolver;

  beforeAll(async () => {
    const model = new TransformersEmbeddingModel("Xenova/all-MiniLM-L6-v2");
    const memCache = new Map<string, Float32Array>();
    const embedder = new CachedEmbedder(model, "Xenova/all-MiniLM-L6-v2", {
      getEmbedding: (key: string) => memCache.get(key) ?? null,
      putEmbedding: (key: string, _model: string, vec: Float32Array) => {
        memCache.set(key, vec);
      },
    } as any);
    resolver = new MultiSignalResolver(embedder, bands);
    await embedder.embed("warmup");
  }, MODEL_TIMEOUT_MS);

  it(
    "a true relabeling (synonym) survives and grounds — the resolver's core value proposition",
    async () => {
      const target: Tier1Target = {
        label: "More information...",
        semantics: ["more information", "learn more", "documentation link"],
        role: "link",
        actions: ["click"],
        intent: "navigate to the IANA info page",
      };
      const candidates = [
        cand({
          id: "renamed-link",
          tag: "a",
          role: "link",
          label: "Learn more", // copy changed from "More information..." after a redesign
        }),
        cand({
          id: "unrelated",
          tag: "a",
          role: "link",
          label: "Privacy policy",
        }),
      ];
      const res = await resolver.resolve({
        target,
        candidates,
        page,
        generalization: "same_element",
      });
      expect(res.status).toBe("grounded");
      expect(res.selected).toBe("renamed-link");
    },
    MODEL_TIMEOUT_MS,
  );

  it(
    "structure/context corroboration prevents an antonym-confused semantic score from winning alone",
    async () => {
      // "Log in" (target) vs "Log out" (decoy, wrong action entirely) vs the true match with a
      // weaker label but a matching testId/region. Semantics alone might rate "Log out" as
      // plausible (shared vocabulary/structure) — structure's testId anchor should decide it.
      const target: Tier1Target = {
        label: "Log in",
        semantics: ["log in", "sign in", "authenticate"],
        role: "button",
        actions: ["click"],
        intent: "submit the login form",
      };
      const candidates = [
        cand({
          id: "logout-decoy",
          tag: "button",
          role: "button",
          label: "Log out",
        }),
        cand({
          id: "true-login",
          tag: "button",
          role: "button",
          label: "Sign in",
          region: "form",
          testId: "login-submit",
        }),
      ];
      const res = await resolver.resolve({
        target,
        candidates,
        page,
        generalization: "same_element",
      });
      expect(res.selected).toBe("true-login");
    },
    MODEL_TIMEOUT_MS,
  );

  it(
    "with no structural tiebreaker available, an antonym decoy can still create a genuine ambiguity",
    async () => {
      // Same setup as above but WITHOUT the testId/region anchor on the true match — this
      // documents the residual risk (not a bug): if structure/context can't corroborate, the
      // resolver's honest fallback is to downgrade to ambiguous rather than silently pick the
      // antonym, but it also cannot guarantee the correct element grounds at high confidence.
      const target: Tier1Target = {
        label: "Log in",
        semantics: ["log in", "sign in", "authenticate"],
        role: "button",
        actions: ["click"],
        intent: "submit the login form",
      };
      const candidates = [
        cand({
          id: "logout-decoy",
          tag: "button",
          role: "button",
          label: "Log out",
        }),
        cand({
          id: "true-login",
          tag: "button",
          role: "button",
          label: "Sign in",
        }),
      ];
      const res = await resolver.resolve({
        target,
        candidates,
        page,
        generalization: "same_element",
      });
      // The assertion here is deliberately weak: either it grounds correctly, or it honestly
      // reports ungrounded/ambiguous. What it must NOT do is confidently ground on the decoy.
      if (res.status === "grounded") {
        expect(res.selected).toBe("true-login");
      } else {
        expect(res.selected).toBeNull();
      }
    },
    MODEL_TIMEOUT_MS,
  );

  it(
    "a near-duplicate pair of genuinely identical labeled buttons downgrades rather than guessing",
    async () => {
      const target: Tier1Target = {
        label: "Add to cart",
        semantics: ["add to cart", "buy"],
        role: "button",
        actions: ["click"],
        intent: "add the product to the cart",
      };
      const candidates = [
        cand({
          id: "product-1-add",
          tag: "button",
          role: "button",
          label: "Add to cart",
        }),
        cand({
          id: "product-2-add",
          tag: "button",
          role: "button",
          label: "Add to cart",
        }),
      ];
      const res = await resolver.resolve({
        target,
        candidates,
        page,
        generalization: "same_element",
      });
      expect(res.status).not.toBe("grounded");
    },
    MODEL_TIMEOUT_MS,
  );
});
