import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { type GimbalConfig, PageSnapshot } from "@gimbal/shared";
import type { Page } from "playwright";
import { extractCandidatesWithScroll } from "../grounding/candidate.js";
import { computeDomHash } from "../grounding/dom-hash.js";
import type { DomCandidate } from "../resolver/base.js";

const KEEP = 3; // latest + two previous

// origin + path only: query strings and fragments routinely carry tokens and ids.
export function pageKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split(/[?#]/)[0];
  }
}

export interface SnapshotStore {
  save(snapshot: PageSnapshot): Promise<void>;
  latest(url: string): Promise<PageSnapshot | null>;
}

export class FsSnapshotStore implements SnapshotStore {
  constructor(private dir: string) {}

  private dirFor(url: string) {
    return path.join(
      this.dir,
      createHash("sha1").update(pageKey(url)).digest("hex"),
    );
  }

  async save(snapshot: PageSnapshot): Promise<void> {
    const dir = this.dirFor(snapshot.url);
    await fs.mkdir(dir, { recursive: true });
    // rotate: latest -> prev1 -> prev2
    for (let i = KEEP - 1; i >= 1; i--) {
      const from = path.join(
        dir,
        i === 1 ? "latest.json" : `prev${i - 1}.json`,
      );
      await fs.rename(from, path.join(dir, `prev${i}.json`)).catch(() => {});
    }
    await fs.writeFile(
      path.join(dir, "latest.json"),
      JSON.stringify(PageSnapshot.parse(snapshot), null, 2),
    );
  }

  async latest(url: string): Promise<PageSnapshot | null> {
    try {
      const raw = await fs.readFile(
        path.join(this.dirFor(url), "latest.json"),
        "utf8",
      );
      return PageSnapshot.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}

export function buildSnapshot(opts: {
  candidates: DomCandidate[];
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
  source: PageSnapshot["source"];
  config: GimbalConfig;
}): PageSnapshot {
  return {
    version: "1.0",
    url: pageKey(opts.url),
    capturedAt: new Date().toISOString(),
    viewport: opts.viewport,
    source: opts.source,
    authenticated: Boolean(opts.config.determinism.storageStatePath),
    domHash: computeDomHash(opts.candidates),
    title: opts.title.slice(0, 120),
    elements: opts.candidates
      .filter((c) => c.label || c.testId)
      .map((c) => ({
        role: c.role ?? c.tag,
        name: (c.label ?? "").slice(0, 120),
        region: c.region ?? null,
        ...(c.testId ? { testId: c.testId } : {}),
        ...(c.disabled ? { state: { disabled: true } } : {}),
        path: (c.contextPath ?? []).slice(0, 5),
      })),
  };
}

export async function snapshotPage(
  page: Page,
  config: GimbalConfig,
  source: PageSnapshot["source"],
): Promise<PageSnapshot> {
  const candidates = await extractCandidatesWithScroll(
    page,
    config.maxScrollPasses,
  );
  return buildSnapshot({
    candidates,
    url: page.url(),
    title: await page.title().catch(() => ""),
    viewport: page.viewportSize(),
    source,
    config,
  });
}
