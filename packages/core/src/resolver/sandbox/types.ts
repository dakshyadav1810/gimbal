import type { Tier1Target, Band, Generalization } from "@gimbal/shared";

export interface SandboxCase {
  id: string;
  name: string;
  description: string;
  target: Tier1Target;
  html: string;
  expectedWinnerId: string | null;
  expectedBand: Band;
  generalization?: Generalization;
}
