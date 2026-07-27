import type { Tier1Target } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import type { DomCandidate, PageContext } from "./base.js";
import { MultiSignalResolver } from "./index.js";

// Deterministic bag-of-words fake embedder — no network/model download in tests.
const VOCAB = [
  "email",
  "login",
  "credential",
  "password",
  "submit",
  "cancel",
  "sign",
  "in",
  "textbox",
  "button",
];
const fakeEmbedder = {
  async embed(text: string): Promise<Float32Array> {
    const v = new Float32Array(VOCAB.length);
    const words = text.toLowerCase().split(/\W+/);
    for (const w of words) {
      const i = VOCAB.indexOf(w);
      if (i >= 0) v[i] = 1;
    }
    return v;
  },
};

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

describe("MultiSignalResolver golden cases", () => {
  const resolver = new MultiSignalResolver(fakeEmbedder as any, bands);

  it("unique semantic match grounds high", async () => {
    const target: Tier1Target = {
      label: "Email",
      semantics: ["email", "login", "credential"],
      role: "textbox",
      actions: ["type"],
      intent: "email input",
    };
    const candidates = [
      cand({ id: "c1", label: "Email", region: "form", testId: "email-input" }),
      cand({ id: "c2", label: "Cancel", role: "button", tag: "button" }),
    ];
    const res = await resolver.resolve({
      target,
      candidates,
      page,
      generalization: "same_element",
    });
    expect(res.status).toBe("grounded");
    expect(res.selected).toBe("c1");
    expect(res.band).toBe("high");
  });

  it("icon-only candidate (no label) scores semantics 0 and loses to a labeled one", async () => {
    const target: Tier1Target = {
      label: "Submit",
      semantics: ["submit", "login"],
      role: "button",
      actions: ["click"],
      intent: "submit form",
    };
    const candidates = [
      cand({ id: "icon", tag: "button", role: "button" }), // no label
      cand({ id: "labeled", tag: "button", role: "button", label: "Submit" }),
    ];
    const res = await resolver.resolve({
      target,
      candidates,
      page,
      generalization: "same_element",
    });
    expect(res.selected).toBe("labeled");
    const icon = res.candidates.find((c) => c.id === "icon")!;
    expect(icon.signals.semantics).toBe(0);
  });

  it("affordance filter drops disabled candidates entirely", async () => {
    const target: Tier1Target = {
      label: "Submit",
      semantics: ["submit"],
      role: "button",
      actions: ["click"],
      intent: "x",
    };
    const candidates = [
      cand({ id: "disabled", label: "Submit", disabled: true }),
    ];
    const res = await resolver.resolve({
      target,
      candidates,
      page,
      generalization: "same_element",
    });
    expect(res.status).toBe("ungrounded");
    expect(res.candidates).toHaveLength(0);
  });

  it("ambiguous near-ties within margin downgrade band instead of guessing", async () => {
    const target: Tier1Target = {
      label: "Item",
      semantics: ["item"],
      role: "button",
      actions: ["click"],
      intent: "x",
    };
    const candidates = [
      cand({ id: "a", label: "Item", tag: "button", role: "button" }),
      cand({ id: "b", label: "Item", tag: "button", role: "button" }),
    ];
    const res = await resolver.resolve({
      target,
      candidates,
      page,
      generalization: "same_element",
    });
    expect(res.status).not.toBe("grounded");
  });

  it("a testId tiebreak resolves an otherwise-ambiguous near-tie", async () => {
    const target: Tier1Target = {
      label: "Item",
      semantics: ["item"],
      role: "button",
      actions: ["click"],
      intent: "x",
    };
    const candidates = [
      cand({ id: "a", label: "Item", tag: "button", role: "button" }),
      cand({
        id: "b",
        label: "Item",
        tag: "button",
        role: "button",
        testId: "item-2",
      }),
    ];
    const res = await resolver.resolve({
      target,
      candidates,
      page,
      generalization: "same_element",
    });
    expect(res.status).toBe("grounded");
    expect(res.selected).toBe("b");
  });

  it("no candidates survive affordance -> ungrounded with empty candidate list, not an error", async () => {
    const target: Tier1Target = {
      label: "Ghost",
      semantics: ["ghost"],
      role: "button",
      actions: ["click"],
      intent: "x",
    };
    const res = await resolver.resolve({
      target,
      candidates: [],
      page,
      generalization: "same_element",
    });
    expect(res.status).toBe("ungrounded");
    expect(res.selected).toBeNull();
    expect(res.cachedSelector).toBeNull();
  });

  it("an aggressive generalization grounds despite a near-tie that would ambiguous under same_element", async () => {
    const target: Tier1Target = {
      label: "Cancel",
      semantics: ["cancel"],
      role: "button",
      actions: ["click"],
      intent: "x",
    };
    // "cancel" is in-vocabulary for the fake embedder, so both candidates score high (not 0)
    // semantics, landing the tie in the high band where aggressive-vs-same_element diverges.
    const candidates = [
      cand({ id: "a", label: "Cancel", tag: "button", role: "button" }),
      cand({ id: "b", label: "Cancel", tag: "button", role: "button" }),
    ];
    const res = await resolver.resolve({
      target,
      candidates,
      page,
      generalization: "aggressive",
    });
    expect(res.status).toBe("grounded");
    expect(res.selected).not.toBeNull();
  });

  it("icon-heavy pages lean on structure/affordance when semantics is unavailable for any candidate", async () => {
    const target: Tier1Target = {
      label: "Delete",
      semantics: ["delete", "remove"],
      role: "button",
      actions: ["click"],
      intent: "delete the item",
    };
    const iconPage: PageContext = {
      textDensity: 0.1,
      iconRatio: 0.9,
      hasForm: false,
      hasModal: false,
      repeatedStructure: false,
    };
    const candidates = [
      cand({
        id: "trash-icon",
        tag: "button",
        role: "button",
        testId: "delete-btn",
      }), // no label — semantics can't score it at all
      cand({ id: "other-icon", tag: "button", role: "button" }),
    ];
    const res = await resolver.resolve({
      target,
      candidates,
      page: iconPage,
      generalization: "same_element",
    });
    expect(res.status).toBe("grounded");
    expect(res.selected).toBe("trash-icon");
  });

  it("candidates are returned sorted by score descending regardless of input order", async () => {
    const target: Tier1Target = {
      label: "Email",
      semantics: ["email", "login"],
      role: "textbox",
      actions: ["type"],
      intent: "email input",
    };
    const candidates = [
      cand({ id: "weak", label: "Cancel", role: "button", tag: "button" }),
      cand({
        id: "strong",
        label: "Email",
        region: "form",
        testId: "email-input",
      }),
    ];
    const res = await resolver.resolve({
      target,
      candidates,
      page,
      generalization: "same_element",
    });
    expect(res.candidates[0]?.id).toBe("strong");
    expect(res.candidates[0].score).toBeGreaterThanOrEqual(
      res.candidates[1]?.score ?? 0,
    );
  });

  it("a disabled candidate among enabled ones is excluded from candidatesOut entirely", async () => {
    const target: Tier1Target = {
      label: "Submit",
      semantics: ["submit"],
      role: "button",
      actions: ["click"],
      intent: "x",
    };
    const candidates = [
      cand({ id: "enabled", label: "Submit", tag: "button", role: "button" }),
      cand({
        id: "disabled",
        label: "Submit",
        tag: "button",
        role: "button",
        disabled: true,
      }),
    ];
    const res = await resolver.resolve({
      target,
      candidates,
      page,
      generalization: "same_element",
    });
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0].id).toBe("enabled");
  });
});
