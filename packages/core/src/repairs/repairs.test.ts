import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GroundedTest } from "@gimbal/shared";
import { describe, expect, it, vi } from "vitest";
import type { CacheStore } from "../cache/index.js";
import { FsArtifactStore } from "../storage/index.js";
import { acceptRepair, rejectRepair } from "./decide.js";
import { RepairStore } from "./store.js";

const dir = () => mkdtempSync(path.join(os.tmpdir(), "gimbal-repairs-"));

const heal = (selector: string) => ({
  testId: "t1",
  stepId: "s1",
  kind: "heal" as const,
  status: "proposed" as const,
  before: { selector: "#old" },
  after: { selector },
});

describe("RepairStore", () => {
  it("persists to repairs.json and survives a fresh instance", async () => {
    const d = dir();
    await new RepairStore(d).add(heal("#a"));
    const [r] = await new RepairStore(d).list("t1");
    expect(r).toMatchObject({ stepId: "s1", status: "proposed" });
  });

  it("ignores an identical open proposal and supersedes a different one", async () => {
    const store = new RepairStore(dir());
    await store.add(heal("#a"));
    await store.add(heal("#a"));
    expect(await store.list("t1")).toHaveLength(1);
    await store.add(heal("#b"));
    const all = await store.list("t1");
    expect(all.map((r) => r.status)).toEqual(["superseded", "proposed"]);
  });

  it("keeps every write when several land at once", async () => {
    const store = new RepairStore(dir());
    await Promise.all(
      ["#a", "#b", "#c"].map((sel, i) =>
        store.add({ ...heal(sel), stepId: `s${i}` }),
      ),
    );
    expect(await store.list("t1")).toHaveLength(3);
  });
});

describe("accept / reject", () => {
  async function setup() {
    const d = dir();
    const store = new FsArtifactStore(d);
    const repairs = new RepairStore(d);
    const grounded = {
      flow: {
        id: "flow-1",
        name: "f",
        intent: "i",
        startUrl: "http://localhost/",
        vars: {},
      },
      groundedUrl: "http://localhost/",
      groundedAt: new Date().toISOString(),
      version: "1.0",
      steps: [
        {
          id: "s1",
          kind: "ui",
          action: "click",
          intent: "go",
          onFailure: "abort",
          generalization: "same_element",
          expectedOutcome: [],
          target: {
            label: "Go",
            role: "button",
            semantics: ["go"],
            actions: ["click"],
            intent: "go",
            resolution: {
              status: "grounded",
              confidence: 0.9,
              band: "high",
              selected: "c1",
              cachedSelector: "#old",
              winner: null,
            },
          },
        },
      ],
    } as unknown as GroundedTest;
    await store.saveGrounded("t1", grounded);
    const cache = { clearSelectorsForTest: vi.fn() } as unknown as CacheStore;
    return { store, repairs, cache };
  }

  it("accept folds the selector into grounded.json and clears the cache", async () => {
    const { store, repairs, cache } = await setup();
    const r = await repairs.add(heal("#new"));
    await acceptRepair(repairs, store, cache, r.id);
    const g = await store.loadGrounded("t1");
    expect((g.steps[0] as any).target.resolution.cachedSelector).toBe("#new");
    expect((await repairs.list("t1"))[0].status).toBe("accepted");
    expect(cache.clearSelectorsForTest).toHaveBeenCalledWith("flow-1");
  });

  it("reject records the decision and leaves grounded.json alone", async () => {
    const { store, repairs } = await setup();
    const r = await repairs.add(heal("#new"));
    await rejectRepair(repairs, r.id, "wrong button");
    const g = await store.loadGrounded("t1");
    expect((g.steps[0] as any).target.resolution.cachedSelector).toBe("#old");
    expect((await repairs.list("t1"))[0]).toMatchObject({
      status: "rejected",
      reason: "wrong button",
    });
  });

  it("refuses to accept something that is not proposed", async () => {
    const { store, repairs, cache } = await setup();
    const r = await repairs.add(heal("#new"));
    await rejectRepair(repairs, r.id);
    await expect(acceptRepair(repairs, store, cache, r.id)).rejects.toThrow(
      /only proposed/,
    );
  });
});
