import type { DomCandidate } from "../resolver/base.js";
import type { GroundedResolution, SpecIR, Step, Tier1Target } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import { computeDomHash } from "./dom-hash.js";
import { mergeResolution, toGroundedTest } from "./emitter.js";
import { normalize } from "./normalize.js";

function candidate(overrides: Partial<DomCandidate> = {}): DomCandidate {
  return { id: "c1", selector: "#a", tag: "button", ...overrides };
}

describe("computeDomHash", () => {
  it("is deterministic for the same candidate set", () => {
    const candidates = [candidate({ id: "c1" }), candidate({ id: "c2", tag: "input" })];
    expect(computeDomHash(candidates)).toBe(computeDomHash(candidates));
  });

  it("is order-independent (signature is sorted before hashing)", () => {
    const a = [candidate({ id: "c1", tag: "button" }), candidate({ id: "c2", tag: "input" })];
    const b = [candidate({ id: "c2", tag: "input" }), candidate({ id: "c1", tag: "button" })];
    expect(computeDomHash(a)).toBe(computeDomHash(b));
  });

  it("changes when a candidate's tag/role/testId/id differs", () => {
    const base = [candidate({ tag: "button" })];
    const changed = [candidate({ tag: "a" })];
    expect(computeDomHash(base)).not.toBe(computeDomHash(changed));
  });

  it("returns a hex sha256 digest", () => {
    const hash = computeDomHash([candidate()]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes an empty candidate list to a stable, non-throwing value", () => {
    expect(() => computeDomHash([])).not.toThrow();
    expect(computeDomHash([])).toBe(computeDomHash([]));
  });
});

describe("normalize", () => {
  it("builds a ResolverInput carrying the target, candidates, generalization, and a derived page context", () => {
    const target: Tier1Target = { label: "Submit", semantics: [], role: "button", actions: [], intent: "submit" };
    const candidates = [candidate()];
    const input = normalize(target, candidates, "same_element");
    expect(input.target).toBe(target);
    expect(input.candidates).toBe(candidates);
    expect(input.generalization).toBe("same_element");
    expect(input.page).toMatchObject({
      textDensity: expect.any(Number),
      iconRatio: expect.any(Number),
      hasForm: expect.any(Boolean),
      hasModal: expect.any(Boolean),
      repeatedStructure: expect.any(Boolean),
    });
  });
});

describe("mergeResolution", () => {
  it("attaches the resolution onto a UI step's target", () => {
    const step = {
      kind: "ui",
      id: "s1",
      target: { label: "Submit", semantics: [], role: "button", actions: [], intent: "submit" },
    } as unknown as Step;
    const resolution = { status: "grounded", cachedSelector: "#submit" } as unknown as GroundedResolution;
    const grounded = mergeResolution(step, resolution);
    expect(grounded).toMatchObject({
      kind: "ui",
      target: { label: "Submit", resolution },
    });
  });

  it("passes non-UI steps through unchanged", () => {
    const step = { kind: "api", id: "s1" } as unknown as Step;
    expect(mergeResolution(step, undefined)).toBe(step);
  });

  it("passes a UI step with no target through with target explicitly undefined", () => {
    const step = { kind: "ui", id: "s1", action: "wait" } as unknown as Step;
    const grounded = mergeResolution(step, undefined);
    expect(grounded).toMatchObject({ kind: "ui", id: "s1", target: undefined });
  });
});

describe("toGroundedTest", () => {
  it("stamps groundedAt/groundedUrl and carries over the spec's own fields plus the grounded steps", () => {
    const spec = {
      version: "1.0",
      flow: { id: "t1", name: "Sign in", startUrl: "https://app.test/" },
      steps: [],
    } as unknown as SpecIR;
    const steps = [{ id: "s1", kind: "ui" }] as unknown as ReturnType<typeof mergeResolution>[];
    const grounded = toGroundedTest(spec, steps, "https://app.test/dashboard");
    expect(grounded.flow).toEqual(spec.flow);
    expect(grounded.steps).toBe(steps);
    expect(grounded.groundedUrl).toBe("https://app.test/dashboard");
    expect(typeof grounded.groundedAt).toBe("string");
    expect(() => new Date(grounded.groundedAt)).not.toThrow();
  });
});
