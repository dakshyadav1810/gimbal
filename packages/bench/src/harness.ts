import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, "../../..");

export interface Core {
  proc: ChildProcess;
  base: string;
  dir: string;
  port: number;
  stop(keep?: boolean): void;
}

// Starts the built core as a separate process in a fresh project directory, like a user would.
export async function startCore(
  extraConfig: Record<string, unknown> = {},
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gimbal-bench-")),
): Promise<Core> {
  const port = 24000 + Math.floor(Math.random() * 3000);
  const existing = path.join(dir, "gimbal.config.json");
  const base = fs.existsSync(existing)
    ? JSON.parse(fs.readFileSync(existing, "utf8"))
    : {};
  fs.writeFileSync(
    existing,
    JSON.stringify({
      ...base,
      port,
      timeouts: { actionMs: 2500, navMs: 10000 },
      ...extraConfig,
    }),
  );
  const proc = spawn("node", [path.join(repo, "packages/core/dist/main.js")], {
    cwd: dir,
    stdio: "ignore",
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok)
        return {
          proc,
          base: url,
          dir,
          port,
          stop(keep) {
            proc.kill();
            if (!keep) fs.rmSync(dir, { recursive: true, force: true });
          },
        };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error("core did not start");
}

export async function api(
  base: string,
  method: string,
  url: string,
  body?: unknown,
) {
  const res = await fetch(base + url, {
    method,
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      `${method} ${url} -> ${res.status} ${JSON.stringify(json)}`,
    );
  return json as any;
}

export async function runAndWait(base: string, testId: string) {
  const { runId } = await api(base, "POST", "/api/runs", { testId });
  for (let i = 0; i < 120; i++) {
    const r = await api(base, "GET", `/api/runs/${runId}`).catch(() => null);
    if (r && r.status !== "running") return r;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`run ${runId} did not finish`);
}
