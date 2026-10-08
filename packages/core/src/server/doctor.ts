import fs from "node:fs";
import path from "node:path";
import type { GimbalConfig } from "@gimbal/shared";

export interface DoctorReport {
  chromium: { ok: boolean; detail: string };
  embedding: { ok: boolean; model: string; revision: string; detail: string };
}

// Environment facts only core can answer, because core owns Playwright and the embedding model.
export async function runDoctor(config: GimbalConfig): Promise<DoctorReport> {
  let chromiumOk = false;
  let chromiumDetail = "";
  try {
    const { chromium } = await import("playwright");
    const exe = chromium.executablePath();
    chromiumOk = fs.existsSync(exe);
    chromiumDetail = chromiumOk ? exe : `browser not installed (${exe})`;
  } catch (e) {
    chromiumDetail = String(e);
  }

  let embeddingOk = false;
  let embeddingDetail = "";
  try {
    const { env } = await import("@huggingface/transformers");
    const dir = path.join(String(env.cacheDir), config.embeddingModel);
    embeddingOk = fs.existsSync(dir);
    embeddingDetail = embeddingOk ? dir : `not downloaded (looked in ${dir})`;
  } catch (e) {
    embeddingDetail = String(e);
  }

  return {
    chromium: { ok: chromiumOk, detail: chromiumDetail },
    embedding: {
      ok: embeddingOk,
      model: config.embeddingModel,
      revision: config.embeddingRevision,
      detail: embeddingDetail,
    },
  };
}
