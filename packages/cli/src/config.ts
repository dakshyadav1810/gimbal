import fs from "node:fs";
import { GimbalConfig } from "@gimbal/shared";

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
  return GimbalConfig.parse({ ...fileConfig, ...envConfig, ...flags });
}

export function baseUrl(config: GimbalConfig): string {
  return `http://127.0.0.1:${config.port}`;
}
