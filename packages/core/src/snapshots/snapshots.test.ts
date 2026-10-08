import { mkdtempSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GimbalConfig } from "@gimbal/shared";
import { describe, expect, it } from "vitest";
import type { DomCandidate } from "../resolver/base.js";
import { FsSnapshotStore, buildSnapshot, pageKey } from "./index.js";

const cfg = (storageStatePath?: string) =>
  ({ determinism: { storageStatePath } }) as unknown as GimbalConfig;

const cand = (label: string, extra: Partial<DomCandidate> = {}) =>
  ({
    id: label,
    selector: `#${label}`,
    tag: "button",
    role: "button",
    label,
    contextPath: ["form", "main"],
    ...extra,
  }) as DomCandidate;

const snap = (over = {}) =>
  buildSnapshot({
    candidates: [cand("Save"), cand("Hidden", { disabled: true })],
    url: "https://app.test/settings?token=s3cret#x",
    title: "Settings",
    viewport: { width: 1280, height: 720 },
    source: "refresh",
    config: cfg(),
    ...over,
  });

describe("snapshots", () => {
  it("keeps origin and path only", () => {
    expect(pageKey("https://app.test/a/b?token=1#h")).toBe(
      "https://app.test/a/b",
    );
    expect(JSON.stringify(snap())).not.toContain("s3cret");
  });

  it("records names, roles and disabled state, not values", () => {
    const s = snap();
    expect(s.elements[0]).toMatchObject({ role: "button", name: "Save" });
    expect(s.elements[1].state).toEqual({ disabled: true });
  });

  it("marks the snapshot authenticated only when a saved login was loaded", () => {
    expect(snap().authenticated).toBe(false);
    expect(snap({ config: cfg("auth.json") }).authenticated).toBe(true);
  });

  it("keeps the latest plus two earlier versions", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "gimbal-snap-"));
    const store = new FsSnapshotStore(dir);
    for (const title of ["one", "two", "three", "four"])
      await store.save(snap({ title }));
    expect((await store.latest("https://app.test/settings"))?.title).toBe(
      "four",
    );
    const [sub] = readdirSync(dir);
    expect(readdirSync(path.join(dir, sub)).sort()).toEqual([
      "latest.json",
      "prev1.json",
      "prev2.json",
    ]);
  });

  it("returns null for a page never seen", async () => {
    const store = new FsSnapshotStore(
      mkdtempSync(path.join(os.tmpdir(), "gimbal-snap-")),
    );
    expect(await store.latest("https://nowhere.test/")).toBeNull();
  });
});
