import type { GroundedTest, RepairPayload, SpecIR } from "@gimbal/shared";
import type { Page } from "playwright";
import type { AuthoringService } from "../authoring/index.js";
import type { CacheStore } from "../cache/index.js";
import type { GroundingService } from "../grounding/index.js";
import type { RepairStore } from "../repairs/store.js";
import type { ArtifactStore } from "../storage/index.js";
import { type RepairResult, buildRepairPayload, maintain } from "./repair.js";
import type { Repair } from "@gimbal/shared";
import { audit } from "./audit.js";
import { type HealOutcome, runtimeHeal } from "./runtime.js";

export type Healed = Extract<HealOutcome, { status: "healed" }>;

export type { HealOutcome } from "./runtime.js";
export type { RepairResult } from "./repair.js";

export interface HealingService {
  runtimeHeal(
    test: GroundedTest,
    stepId: string,
    page: Page,
    previousSelector: string | null,
    storeTestId: string,
  ): Promise<HealOutcome>;
  /** Persists a heal once its action has been verified: selector cache, audit log, repairs.json. */
  commitHeal(
    test: GroundedTest,
    storeTestId: string,
    stepId: string,
    heal: Healed,
    verification: Repair["verification"],
  ): Promise<void>;
  /** A heal whose action failed verification: only the audit log hears about it. */
  rejectHeal(
    storeTestId: string,
    stepId: string,
    heal: Healed,
    detail: string,
  ): void;
  /** A still-open proposed selector for this step, reused when the cache has been cleared. */
  findProposal(storeTestId: string, stepId: string): Promise<string | null>;
  buildRepairPayload(testId: string): Promise<RepairPayload>;
  /** patchedSpec is required — the agent always supplies the fix. No provider fallback. */
  maintain(
    testId: string,
    stepIds: string[],
    patchedSpec: SpecIR,
  ): Promise<RepairResult>;
}

export class CoreHealingService implements HealingService {
  constructor(
    private grounding: GroundingService,
    private cache: CacheStore,
    private authoring: AuthoringService,
    private store: ArtifactStore,
    private repairs: RepairStore,
  ) {}

  runtimeHeal(
    test: GroundedTest,
    stepId: string,
    page: Page,
    previousSelector: string | null,
    storeTestId: string,
  ): Promise<HealOutcome> {
    return runtimeHeal(
      this.grounding,
      this.cache,
      test,
      stepId,
      page,
      previousSelector,
      storeTestId,
      this.repairs,
    );
  }

  async commitHeal(
    test: GroundedTest,
    storeTestId: string,
    stepId: string,
    heal: Healed,
    verification: Repair["verification"],
  ) {
    // resolution_cache stays keyed by flow.id (see locate.ts); audit and repairs use the
    // storage-layer id.
    this.cache.putSelector({
      testId: test.flow.id,
      stepId,
      domHash: heal.domHash,
      cachedSelector: heal.cachedSelector,
      band: heal.band,
    });
    audit(this.cache, storeTestId, stepId, "healed", {
      from: heal.from,
      to: heal.cachedSelector,
      band: heal.band,
    });
    await this.repairs.add({ ...heal.proposal, verification });
  }

  rejectHeal(storeTestId: string, stepId: string, heal: Healed, detail: string) {
    audit(this.cache, storeTestId, stepId, "heal_rejected", {
      from: heal.from,
      to: heal.cachedSelector,
      band: heal.band,
      reason: detail,
    });
  }

  async findProposal(storeTestId: string, stepId: string) {
    const open = (await this.repairs.list(storeTestId)).filter(
      (r) => r.stepId === stepId && r.status === "proposed" && r.after,
    );
    return open.at(-1)?.after?.selector ?? null;
  }

  buildRepairPayload(testId: string): Promise<RepairPayload> {
    return buildRepairPayload(this.store, testId);
  }

  maintain(
    testId: string,
    stepIds: string[],
    patchedSpec: SpecIR,
  ): Promise<RepairResult> {
    return maintain(
      this.authoring,
      this.grounding,
      this.store,
      testId,
      stepIds,
      patchedSpec,
    );
  }
}
