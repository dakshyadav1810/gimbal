import fs from "node:fs";
import { GimbalConfig } from "@gimbal/shared";

export function loadConfig(): GimbalConfig {
  let fileConfig: Record<string, unknown> = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync("gimbal.config.json", "utf-8"));
  } catch {
    // no project config — defaults + env only
  }
  const envConfig = process.env.GIMBAL_PORT
    ? { port: Number(process.env.GIMBAL_PORT) }
    : {};
  return GimbalConfig.parse({ ...fileConfig, ...envConfig });
}
