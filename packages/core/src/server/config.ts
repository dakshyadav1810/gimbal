import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

export function loadConfig(): GimbalConfig {
  let fileConfig: Record<string, unknown> = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync("gimbal.config.json", "utf-8"));
  } catch (err) {
    const reason =
      (err as NodeJS.ErrnoException).code === "ENOENT"
        ? "no gimbal.config.json found"
        : `gimbal.config.json is invalid: ${(err as Error).message}`;
    console.warn(
      `[gimbal] ${reason} in ${process.cwd()} — falling back to defaults. If tests/.gimbal state seem missing, you're probably running gimbal from the wrong directory.`,
    );
  }
  const envConfig = process.env.GIMBAL_PORT
    ? { port: Number(process.env.GIMBAL_PORT) }
    : {};
  const parsed = GimbalConfig.parse({ ...fileConfig, ...envConfig });

  // Dynamically resolve relative directories relative to homedir if the CWD is read-only
  parsed.dbPath = ensureWritablePath(parsed.dbPath);
  parsed.artifactsDir = ensureWritablePath(parsed.artifactsDir);
  parsed.screenshotsDir = ensureWritablePath(parsed.screenshotsDir);

  return parsed;
}
