import path from "node:path";
import { describe, expect, it } from "vitest";
import { candidatesPath, groundedPath, specPath, testDir } from "./layout.js";

describe("storage layout paths", () => {
  it("nests every artifact path under <artifactsDir>/<testId>/", () => {
    const dir = testDir("/data/tests", "abc123");
    expect(dir).toBe(path.join("/data/tests", "abc123"));
    expect(specPath("/data/tests", "abc123")).toBe(path.join(dir, "spec.json"));
    expect(candidatesPath("/data/tests", "abc123")).toBe(path.join(dir, "candidates.json"));
    expect(groundedPath("/data/tests", "abc123")).toBe(path.join(dir, "grounded.json"));
  });

  it("produces distinct paths for distinct testIds under the same artifactsDir", () => {
    expect(specPath("/data/tests", "a")).not.toBe(specPath("/data/tests", "b"));
  });
});
