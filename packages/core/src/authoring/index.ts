import { SpecIR, lintSpec } from "@gimbal/shared";
import { normalizeLlmOutput } from "./emitter.js";

export interface AuthoringService {
  /** The only way a spec is created: an agent has already authored it; core validates + stores. */
  submit(spec: unknown): Promise<SpecIR>;
}

export class AuthoringError extends Error {}

// No LLM client here, ever — Gimbal never calls a model provider. The connected agent (Claude Code,
// Cursor, ...) authors the spec entirely in its own session and hands core the finished SpecIR.
export class CoreAuthoringService implements AuthoringService {
  async submit(spec: unknown): Promise<SpecIR> {
    const parsed = SpecIR.parse(normalizeLlmOutput(spec));
    const lint = lintSpec(parsed);
    if (!lint.ok)
      throw new AuthoringError(`spec failed lint: ${lint.errors.join("; ")}`);
    return parsed;
  }
}
