import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { type Repair, RepairsDoc } from "@gimbal/shared";
import { repairsPath, testDir } from "../storage/layout.js";

export type NewRepair = Omit<Repair, "id" | "createdAt">;

// Per-test repairs.json. Writes are serialized per process: a run and a dashboard click can touch
// the same file at once, and a lost update would silently drop a reviewer's decision.
export class RepairStore {
  private queues = new Map<string, Promise<unknown>>();

  constructor(private artifactsDir: string) {}

  async list(testId: string): Promise<Repair[]> {
    try {
      const raw = await fs.readFile(
        repairsPath(this.artifactsDir, testId),
        "utf8",
      );
      return RepairsDoc.parse(JSON.parse(raw)).repairs;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  async listAll(): Promise<Repair[]> {
    let ids: string[];
    try {
      ids = await fs.readdir(this.artifactsDir);
    } catch {
      return [];
    }
    const all = await Promise.all(
      ids.map((id) => this.list(id).catch(() => [])),
    );
    return all.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async find(repairId: string): Promise<Repair | null> {
    return (await this.listAll()).find((r) => r.id === repairId) ?? null;
  }

  // Applies `fn` to the test's repairs under a lock and writes the result.
  mutate<T>(
    testId: string,
    fn: (repairs: Repair[]) => { repairs: Repair[]; result: T },
  ): Promise<T> {
    const prev = this.queues.get(testId) ?? Promise.resolve();
    const next = prev.then(async () => {
      const { repairs, result } = fn(await this.list(testId));
      await fs.mkdir(testDir(this.artifactsDir, testId), { recursive: true });
      const doc = RepairsDoc.parse({ version: "1.0", repairs });
      await fs.writeFile(
        repairsPath(this.artifactsDir, testId),
        JSON.stringify(doc, null, 2),
      );
      return result;
    });
    this.queues.set(
      testId,
      next.catch(() => {}),
    );
    return next;
  }

  // Adds a repair, superseding any still-open one for the same step so a step never shows two
  // competing proposals. Re-proposing the identical selector is a no-op.
  add(rec: NewRepair): Promise<Repair> {
    return this.mutate(rec.testId, (repairs) => {
      const open = (r: Repair) =>
        r.stepId === rec.stepId &&
        (r.status === "proposed" || r.status === "needed");
      const same = repairs.find(
        (r) =>
          open(r) &&
          r.kind === rec.kind &&
          r.after?.selector === rec.after?.selector,
      );
      if (same) return { repairs, result: same };
      const now = new Date().toISOString();
      const created: Repair = { ...rec, id: randomUUID(), createdAt: now };
      const next = repairs.map((r) =>
        open(r) ? { ...r, status: "superseded" as const, decidedAt: now } : r,
      );
      next.push(created);
      return { repairs: next, result: created };
    });
  }

  decide(
    testId: string,
    repairId: string,
    status: "accepted" | "rejected",
    reason?: string,
  ): Promise<Repair | null> {
    return this.mutate(testId, (repairs) => {
      const idx = repairs.findIndex((r) => r.id === repairId);
      if (idx < 0) return { repairs, result: null };
      const updated: Repair = {
        ...repairs[idx],
        status,
        decidedAt: new Date().toISOString(),
        ...(reason ? { reason } : {}),
      };
      const next = [...repairs];
      next[idx] = updated;
      return { repairs: next, result: updated };
    });
  }
}
