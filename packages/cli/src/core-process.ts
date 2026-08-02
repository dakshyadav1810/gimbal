import fs from "node:fs";
import path from "node:path";
import type { GimbalConfig } from "@gimbal/shared";
import { execa } from "execa";
import { baseUrl } from "./config.js";

const PID_FILE = path.join(".gimbal", "gimbal.pid");

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // core not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`core did not become healthy within ${timeoutMs}ms`);
}

// Used to make `start`/`mcp` idempotent: skip spawning a second core (and, for `start`, skip opening a
// second dashboard tab) if one is already answering on the configured port.
export async function isCoreAlive(config: GimbalConfig): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl(config)}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// Spawns core as a child process, records its PID so `gimbal stop` (any terminal) can find it (LLD-009 §3).
export async function startCore(
  config: GimbalConfig,
  coreEntry: string,
): Promise<number | undefined> {
  const child = execa("node", [coreEntry], {
    env: { ...process.env, GIMBAL_PORT: String(config.port) },
    detached: true,
    stdio: "ignore",
  });
  fs.mkdirSync(".gimbal", { recursive: true });
  fs.writeFileSync(PID_FILE, String(child.pid));
  child.unref();

  await waitForHealth(baseUrl(config), 15000);
  // Return the pid, never `child` itself: execa's result is a thenable that settles only when core
  // exits, and an async function adopts a returned thenable — so `return child` would make
  // startCore() hang until the (long-lived) core process died.
  return child.pid;
}

export function stopCore(): boolean {
  if (!fs.existsSync(PID_FILE)) return false;
  const pid = Number(fs.readFileSync(PID_FILE, "utf-8"));
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // already dead
  }
  fs.rmSync(PID_FILE, { force: true });
  return true;
}
