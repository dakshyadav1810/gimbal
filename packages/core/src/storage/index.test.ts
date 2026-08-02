import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CandidatesDoc, GroundedTest, SpecIR } from "@gimbal/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ArtifactStore, FsArtifactStore } from "./index.js";

function validSpec(overrides: Partial<SpecIR["flow"]> = {}): SpecIR {
  return {
    version: "1.0",
    flow: {
      id: "t1",
      name: "Sign in",
      intent: "verify sign-in works",
      startUrl: "https://app.test/sign-in",
      vars: {},
      ...overrides,
    },
    steps: [
      {
        id: "s1",
        intent: "click submit",
        onFailure: "abort",
        preconditions: [],
        assertions: [],
        negative: false,
        kind: "ui",
        action: "click",
        generalization: "same_element",
        expectedOutcome: [{ type: "navigation" }],
        target: { label: "Submit", semantics: ["submit button"], role: "button", actions: [], intent: "submit" },
      },
    ],
  };
}

function validGroundedTest(): GroundedTest {
  const { steps, ...rest } = validSpec();
  return {
    ...rest,
    groundedAt: "2026-07-28T00:00:00.000Z",
    groundedUrl: "https://app.test/dashboard",
    steps,
  };
}

function validCandidatesDoc(): CandidatesDoc {
  return {
    version: "1.0",
    specId: "t1",
    groundedAt: "2026-07-28T00:00:00.000Z",
    groundedUrl: "https://app.test/dashboard",
    steps: [],
  };
}

describe("FsArtifactStore", () => {
  let dir: string;
  let store: ArtifactStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "gimbal-storage-test-"));
    store = new FsArtifactStore(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("saveSpec generates a testId when none is given, and loadSpec round-trips it", async () => {
    const testId = await store.saveSpec(validSpec());
    expect(typeof testId).toBe("string");
    const loaded = await store.loadSpec(testId);
    expect(loaded.flow.id).toBe("t1");
  });

  it("saveSpec honors an explicit testId", async () => {
    const testId = await store.saveSpec(validSpec(), "explicit-id");
    expect(testId).toBe("explicit-id");
    const loaded = await store.loadSpec("explicit-id");
    expect(loaded.flow.name).toBe("Sign in");
  });

  it("saveSpec rejects an invalid spec before writing anything to disk", async () => {
    await expect(store.saveSpec({ garbage: true } as unknown as SpecIR, "bad")).rejects.toThrow();
    await expect(store.loadSpec("bad")).rejects.toThrow();
  });

  it("loadSpec throws for a testId that was never saved", async () => {
    await expect(store.loadSpec("never-existed")).rejects.toThrow();
  });

  it("saveGrounded/loadGrounded round-trip a grounded test", async () => {
    await store.saveSpec(validSpec(), "t1");
    await store.saveGrounded("t1", validGroundedTest());
    const loaded = await store.loadGrounded("t1");
    expect(loaded.groundedUrl).toBe("https://app.test/dashboard");
  });

  it("saveCandidates writes without throwing and re-validates the doc", async () => {
    await expect(store.saveCandidates("t1", validCandidatesDoc())).resolves.toBeUndefined();
    await expect(
      store.saveCandidates("t1", { garbage: true } as unknown as CandidatesDoc),
    ).rejects.toThrow();
  });

  it("list() returns an empty array when no tests exist yet", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("list() summarizes saved tests, flagging whether each is grounded", async () => {
    await store.saveSpec(validSpec({ id: "t1" }), "t1");
    await store.saveSpec(validSpec({ id: "t2" }), "t2");
    await store.saveGrounded("t2", validGroundedTest());

    const list = await store.list();
    const byId = Object.fromEntries(list.map((s) => [s.testId, s]));
    expect(byId.t1.grounded).toBe(false);
    expect(byId.t2.grounded).toBe(true);
    expect(byId.t1.name).toBe("Sign in");
  });

  it("list() skips directories that don't contain a valid spec.json", async () => {
    await store.saveSpec(validSpec(), "good");
    await fs.mkdir(path.join(dir, "junk-dir"), { recursive: true });
    const list = await store.list();
    expect(list.map((s) => s.testId)).toEqual(["good"]);
  });

  it("delete removes the test's entire directory", async () => {
    const testId = await store.saveSpec(validSpec(), "to-delete");
    await store.delete(testId);
    await expect(store.loadSpec(testId)).rejects.toThrow();
  });

  it("delete on a testId that never existed does not throw", async () => {
    await expect(store.delete("never-existed")).resolves.toBeUndefined();
  });
});
