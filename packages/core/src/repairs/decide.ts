import type { Repair } from "@gimbal/shared";
import type { CacheStore } from "../cache/index.js";
import type { ArtifactStore } from "../storage/index.js";
import type { RepairStore } from "./store.js";

export class RepairError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_state",
    message: string,
  ) {
    super(message);
  }
}

// Accepting folds the proposed selector into grounded.json so the change survives deleting the
// cache and shows up in version control; the stale cache entry for the flow is dropped.
export async function acceptRepair(
  repairs: RepairStore,
  store: ArtifactStore,
  cache: CacheStore,
  repairId: string,
): Promise<Repair> {
  const repair = await repairs.find(repairId);
  if (!repair)
    throw new RepairError("not_found", `repair ${repairId} not found`);
  if (repair.status !== "proposed" || !repair.after)
    throw new RepairError(
      "invalid_state",
      `repair is ${repair.status}${repair.after ? "" : " and has no proposed selector"}; only proposed repairs can be accepted`,
    );
  const test = await store.loadGrounded(repair.testId);
  const step = test.steps.find((s) => s.id === repair.stepId);
  if (step?.kind !== "ui" || !step.target?.resolution)
    throw new RepairError(
      "invalid_state",
      `step ${repair.stepId} has no grounded target to update`,
    );
  const res = step.target.resolution;
  res.cachedSelector = repair.after.selector;
  if (res.winner) {
    res.winner = {
      ...res.winner,
      selector: repair.after.selector,
      label: repair.after.label ?? res.winner.label,
      role: repair.after.role ?? res.winner.role,
      region: repair.after.region ?? res.winner.region,
      frame: repair.after.frame,
    };
  }
  await store.saveGrounded(repair.testId, test);
  cache.clearSelectorsForTest(test.flow.id);
  return (await repairs.decide(repair.testId, repairId, "accepted"))!;
}

export async function rejectRepair(
  repairs: RepairStore,
  repairId: string,
  reason?: string,
): Promise<Repair> {
  const repair = await repairs.find(repairId);
  if (!repair)
    throw new RepairError("not_found", `repair ${repairId} not found`);
  if (repair.status !== "proposed" && repair.status !== "needed")
    throw new RepairError(
      "invalid_state",
      `repair is already ${repair.status}`,
    );
  return (await repairs.decide(repair.testId, repairId, "rejected", reason))!;
}
