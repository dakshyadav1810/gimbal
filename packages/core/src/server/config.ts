import fs from "node:fs";
import { GimbalConfig } from "@gimbal/shared";

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
      `[gimbal] ${reason} in ${process.cwd()} — falling back to defaults. ` +
        `If tests/.gimbal state seem missing, you're probably running gimbal from the wrong directory.`,
    );
  }
  const envConfig = process.env.GIMBAL_PORT
    ? { port: Number(process.env.GIMBAL_PORT) }
    : {};
  return GimbalConfig.parse({ ...fileConfig, ...envConfig });
}
