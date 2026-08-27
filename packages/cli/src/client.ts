import type {
  GroundedTest,
  MaintainRequest,
  RepairPayload,
  RunReport,
  RunRequest,
  SpecIR,
} from "@gimbal/shared";

export interface TestSummary {
  testId: string;
  name: string;
  grounded: boolean;
}

// Thrown by CoreClient on a non-2xx response. Carries the parsed {code,message} from core's
// error envelope (see server/app.ts's error handler) so callers can format a clean message
// instead of re-parsing a raw "METHOD path -> status: body" string themselves.
export class CoreApiError extends Error {
  constructor(
    public status: number,
    public apiCode: string,
    apiMessage: string,
  ) {
    super(apiMessage);
    this.name = "CoreApiError";
  }
}

// The CLI's ONLY channel to core — typed REST wrapper, no direct import of core internals (LLD-009 §4).
export class CoreClient {
  constructor(private base: string) {}

  private async req<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text) as {
          error?: { code?: string; message?: string };
        };
        if (parsed.error) {
          throw new CoreApiError(
            res.status,
            parsed.error.code ?? "unknown",
            parsed.error.message ?? text,
          );
        }
      } catch (e) {
        if (e instanceof CoreApiError) throw e;
        // text wasn't core's {error:{code,message}} envelope — fall through to raw dump below
      }
      throw new CoreApiError(res.status, "unknown", text);
    }
    return res.json() as Promise<T>;
  }

  health() {
    return this.req<{ ok: boolean }>("GET", "/health");
  }
  getKdg(entryUrl: string) {
    return this.req<unknown>(
      "GET",
      `/api/kdg?entry=${encodeURIComponent(entryUrl)}`,
    );
  }
  submitSpec(spec: SpecIR) {
    return this.req<{ testId: string; spec: SpecIR }>(
      "POST",
      "/api/tests",
      spec,
    );
  }
  groundTest(testId: string) {
    return this.req<{ grounded: GroundedTest; stoppedAt?: string }>(
      "POST",
      `/api/tests/${testId}/ground`,
    );
  }
  listTests() {
    return this.req<TestSummary[]>("GET", "/api/tests");
  }
  getTest(testId: string) {
    return this.req<GroundedTest | SpecIR>("GET", `/api/tests/${testId}`);
  }
  deleteTest(testId: string) {
    return this.req<{ ok: boolean }>("DELETE", `/api/tests/${testId}`);
  }
  runTest(req: RunRequest) {
    return this.req<{ runId: string }>("POST", "/api/runs", req);
  }
  getReport(runId: string) {
    return this.req<RunReport>("GET", `/api/runs/${runId}`);
  }
  getRepairPayload(testId: string) {
    return this.req<RepairPayload>("GET", `/api/tests/${testId}/repair`);
  }
  maintain(testId: string, req: MaintainRequest) {
    return this.req<{ testId: string }>(
      "POST",
      `/api/tests/${testId}/maintain`,
      req,
    );
  }
}
