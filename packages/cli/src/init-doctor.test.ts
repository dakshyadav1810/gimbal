import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkNode, checkUrl, formatReport } from "./doctor.js";
import { initProject } from "./init.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gimbal-init-"));

describe("initProject", () => {
  it("creates the expected files, and nothing changes on a second run", () => {
    const dir = tmp();
    const first = initProject(dir);
    expect(
      first.every((l) => l.includes("created") || l.includes("kept")),
    ).toBe(true);
    expect(
      fs.readFileSync(path.join(dir, ".gimbal/.gitignore"), "utf8"),
    ).toContain("cache.db*");
    expect(
      fs.readFileSync(path.join(dir, ".gimbal/.gitignore"), "utf8"),
    ).not.toMatch(/^tests/m);
    const before = fs.readFileSync(
      path.join(dir, "gimbal.config.json"),
      "utf8",
    );
    const second = initProject(dir);
    expect(second.every((l) => l.includes("kept"))).toBe(true);
    expect(fs.readFileSync(path.join(dir, "gimbal.config.json"), "utf8")).toBe(
      before,
    );
  });

  it("does not overwrite a config the user edited", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "gimbal.config.json"), '{"port":1}');
    initProject(dir);
    expect(fs.readFileSync(path.join(dir, "gimbal.config.json"), "utf8")).toBe(
      '{"port":1}',
    );
  });

  it("installs the skill only when asked or when .claude exists", () => {
    const plain = tmp();
    initProject(plain);
    expect(fs.existsSync(path.join(plain, ".claude"))).toBe(false);

    const withClaude = tmp();
    fs.mkdirSync(path.join(withClaude, ".claude"));
    initProject(withClaude);
    expect(
      fs.readFileSync(
        path.join(withClaude, ".claude/skills/gimbal/SKILL.md"),
        "utf8",
      ),
    ).toContain("name: gimbal");

    const asked = tmp();
    initProject(asked, { agent: "claude" });
    expect(
      fs.existsSync(path.join(asked, ".claude/skills/gimbal/SKILL.md")),
    ).toBe(true);
  });
});

describe("doctor", () => {
  it("rejects old Node with a fix", () => {
    expect(checkNode("20.11.0")).toMatchObject({ ok: false });
    expect(checkNode("22.1.0").ok).toBe(true);
  });

  it("reports an unreachable app", async () => {
    const check = await checkUrl("http://x.test", (async () => {
      throw new Error("refused");
    }) as unknown as typeof fetch);
    expect(check).toMatchObject({
      ok: false,
      fix: expect.stringContaining("--url"),
    });
  });

  it("prints ticks, the fix for each failure, and a verdict", () => {
    const out = formatReport([
      { name: "Node 22", ok: true },
      {
        name: "Chromium",
        ok: false,
        detail: "missing",
        fix: "npx playwright install chromium",
      },
    ]);
    expect(out).toContain("✓ Node 22");
    expect(out).toContain("fix: npx playwright install chromium");
    expect(out).toContain("Not ready: 1 problem.");
    expect(formatReport([{ name: "Node 22", ok: true }])).toContain("Ready.");
  });
});
