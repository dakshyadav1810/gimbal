import { describe, expect, it } from "vitest";
import { normalizeLlmOutput } from "./emitter.js";
import { AuthoringError, CoreAuthoringService } from "./index.js";
import { EmptyKdgContextProvider } from "./kdg-context.js";

function validSpecCamelCase() {
  return {
    version: "1.0",
    flow: {
      id: "t1",
      name: "Sign in",
      intent: "verify sign-in works",
      startUrl: "https://app.test/sign-in",
      vars: { email: "dana@example.com" },
    },
    steps: [
      {
        id: "s1",
        intent: "type email",
        kind: "ui",
        action: "type",
        value: "${email}",
        target: {
          label: "Email",
          semantics: ["email address"],
          role: "textbox",
          actions: [],
          intent: "email field",
        },
        expectedOutcome: [{ type: "field_contains", value: "${email}" }],
      },
    ],
  };
}

describe("normalizeLlmOutput", () => {
  it("converts snake_case object keys to camelCase, recursively", () => {
    const out = normalizeLlmOutput({
      start_url: "https://x",
      flow: { flow_id: "t1", nested_thing: { deep_key: 1 } },
    });
    expect(out).toEqual({
      startUrl: "https://x",
      flow: { flowId: "t1", nestedThing: { deepKey: 1 } },
    });
  });

  it("walks arrays and converts keys within array elements", () => {
    const out = normalizeLlmOutput({
      steps: [{ step_id: "s1" }, { step_id: "s2" }],
    });
    expect(out).toEqual({ steps: [{ stepId: "s1" }, { stepId: "s2" }] });
  });

  it("leaves already-camelCase keys unchanged", () => {
    const out = normalizeLlmOutput({ flowId: "t1", startUrl: "https://x" });
    expect(out).toEqual({ flowId: "t1", startUrl: "https://x" });
  });

  it("passes through non-object values (primitives, null) unchanged", () => {
    expect(normalizeLlmOutput("a string")).toBe("a string");
    expect(normalizeLlmOutput(42)).toBe(42);
    expect(normalizeLlmOutput(null)).toBeNull();
  });
});

describe("EmptyKdgContextProvider", () => {
  it("always returns an empty routes/conditionals context regardless of entryUrl", async () => {
    const provider = new EmptyKdgContextProvider();
    expect(await provider.build("https://app.test/")).toEqual({
      routes: [],
      conditionals: [],
    });
    expect(await provider.build("")).toEqual({ routes: [], conditionals: [] });
  });
});

describe("CoreAuthoringService", () => {
  it("submit() normalizes snake_case input, validates it against SpecIR, and returns the parsed spec", async () => {
    const service = new CoreAuthoringService(new EmptyKdgContextProvider());
    const snakeCaseInput = {
      version: "1.0",
      flow: {
        id: "t1",
        name: "Sign in",
        intent: "verify sign-in works",
        start_url: "https://app.test/sign-in",
        vars: { email: "dana@example.com" },
      },
      steps: validSpecCamelCase().steps,
    };
    const parsed = await service.submit(snakeCaseInput);
    expect(parsed.flow.startUrl).toBe("https://app.test/sign-in");
  });

  it("submit() rejects a spec that fails lint (e.g. no assertion/expectedOutcome anywhere)", async () => {
    const service = new CoreAuthoringService(new EmptyKdgContextProvider());
    const spec = validSpecCamelCase();
    spec.steps[0].expectedOutcome = [];
    await expect(service.submit(spec)).rejects.toThrow(AuthoringError);
  });

  it("submit() rejects input that doesn't even match the SpecIR schema shape", async () => {
    const service = new CoreAuthoringService(new EmptyKdgContextProvider());
    await expect(service.submit({ garbage: true })).rejects.toThrow();
  });

  it("context() delegates to the injected KdgContextProvider", async () => {
    const service = new CoreAuthoringService(new EmptyKdgContextProvider());
    expect(await service.context("https://app.test/")).toEqual({
      routes: [],
      conditionals: [],
    });
  });
});
