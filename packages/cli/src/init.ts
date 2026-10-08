import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GITIGNORE = `# Gimbal: keep tests/ (the tests and their repairs), ignore everything machine-local.
cache.db*
screenshots/
snapshots/
fixtures/
gimbal.pid
`;

export const MCP_ADD = "claude mcp add gimbal -- npx gimbal mcp";
export const MCP_JSON = JSON.stringify(
  { mcpServers: { gimbal: { command: "npx", args: ["gimbal", "mcp"] } } },
  null,
  2,
);

function skillSource(): string {
  // dist/init.js -> ../skills ; src/init.ts -> ../skills
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "skills", "gimbal", "SKILL.md");
}

// Idempotent: never overwrites a file that already exists. Returns what it did, one line each.
export function initProject(
  cwd: string,
  opts: { agent?: string } = {},
): string[] {
  const out: string[] = [];
  const write = (rel: string, content: string | Buffer) => {
    const file = path.join(cwd, rel);
    if (fs.existsSync(file)) {
      out.push(`  kept     ${rel}`);
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    out.push(`  created  ${rel}`);
  };

  fs.mkdirSync(path.join(cwd, ".gimbal", "tests"), { recursive: true });
  write(".gimbal/.gitignore", GITIGNORE);
  write("gimbal.config.json", `${JSON.stringify({ port: 4319 }, null, 2)}\n`);

  if (opts.agent === "claude" || fs.existsSync(path.join(cwd, ".claude"))) {
    write(".claude/skills/gimbal/SKILL.md", fs.readFileSync(skillSource()));
  }
  return out;
}
