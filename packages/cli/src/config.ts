import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { GimbalConfig } from "@gimbal/shared";

function ensureWritablePath(originalPath: string): string {
  if (!path.isAbsolute(originalPath)) {
    try {
      const testDir = path.dirname(originalPath);
      fs.mkdirSync(testDir, { recursive: true });
      return originalPath;
    } catch {
      const fallbackBase = path.join(os.homedir(), ".gimbal");
      const relativePart = originalPath.startsWith(".gimbal/")
        ? originalPath.slice(8)
        : originalPath;
      const resolved = path.join(fallbackBase, relativePart);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      return resolved;
    }
  }
  return originalPath;
}

// Precedence: CLI flags -> env -> gimbal.config.json -> defaults (LLD-009 §6).
export function loadConfig(flags: Partial<GimbalConfig> = {}): GimbalConfig {
  let fileConfig: Record<string, unknown> = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync("gimbal.config.json", "utf-8"));
  } catch {
    // no project config
  }
  const envConfig = process.env.GIMBAL_PORT
    ? { port: Number(process.env.GIMBAL_PORT) }
    : {};
  const parsed = GimbalConfig.parse({ ...fileConfig, ...envConfig, ...flags });

  // Dynamically resolve relative directories relative to homedir if the CWD is read-only
  parsed.dbPath = ensureWritablePath(parsed.dbPath);
  parsed.artifactsDir = ensureWritablePath(parsed.artifactsDir);
  parsed.screenshotsDir = ensureWritablePath(parsed.screenshotsDir);

  return parsed;
}

export function baseUrl(config: GimbalConfig): string {
  return `http://127.0.0.1:${config.port}`;
}
