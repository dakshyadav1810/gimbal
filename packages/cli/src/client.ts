import type {
  GetPageResponse,
  GroundedTest,
  MaintainRequest,
  Repair,
  RepairPayload,
  RunReport,
  RunRequest,
  SpecIR,
  Tier1Target,
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
  async getPage(url: string, refresh = false) {
    if (!refresh) {
      try {
        return await this.req<GetPageResponse>(
          "GET",
          `/api/snapshots?url=${encodeURIComponent(url)}`,
        );
      } catch (e) {
        // Never observed yet: fall through and look at it now.
        if (!(e instanceof CoreApiError && e.status === 404)) throw e;
      }
    }
    return this.req<GetPageResponse>("POST", "/api/snapshots/refresh", { url });
  }
  listRepairs(opts: { testId?: string; status?: string } = {}) {
    const q = new URLSearchParams();
    if (opts.testId) q.set("testId", opts.testId);
    if (opts.status) q.set("status", opts.status);
    const qs = q.toString();
    return this.req<Repair[]>("GET", `/api/repairs${qs ? `?${qs}` : ""}`);
  }
  acceptRepair(repairId: string) {
    return this.req<Repair>("POST", `/api/repairs/${repairId}/accept`);
  }
  rejectRepair(repairId: string, reason?: string) {
    return this.req<Repair>("POST", `/api/repairs/${repairId}/reject`, {
      reason,
    });
  }
  doctor() {
    return this.req<{
      chromium: { ok: boolean; detail: string };
      embedding: {
        ok: boolean;
        model: string;
        revision: string;
        detail: string;
      };
    }>("GET", "/api/doctor");
  }
  warmModel() {
    return this.req<unknown>("POST", "/api/doctor/warm-model");
  }
  submitSpec(spec: SpecIR) {
    return this.req<{ testId: string; spec: SpecIR }>(
      "POST",
      "/api/tests",
      spec,
    );
  }
  groundTest(testId: string) {
    return this.req<{
      grounded: GroundedTest;
      stoppedAt?: string;
      ungrounded?: unknown[];
    }>("POST", `/api/tests/${testId}/ground`);
  }
  async authorTest(spec: SpecIR) {
    const { testId } = await this.submitSpec(spec);
    const groundResult = await this.groundTest(testId);
    return { testId, ...groundResult };
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
  async runTestSync(
    req: RunRequest,
    timeoutMs = 30000,
    pollIntervalMs = 200,
  ): Promise<RunReport> {
    const { runId } = await this.runTest(req);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const report = await this.getReport(runId);
      if (report.status !== "running") {
        return report;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(`Run ${runId} timed out after ${timeoutMs}ms`);
  }
  getReport(runId: string) {
    return this.req<RunReport>("GET", `/api/runs/${runId}`);
  }
  getRepairContext(testId: string) {
    return this.req<RepairPayload>(
      "GET",
      `/api/tests/${testId}/repair-context`,
    );
  }
  submitRepair(testId: string, req: MaintainRequest) {
    return this.req<{ testId: string }>(
      "POST",
      `/api/tests/${testId}/repair`,
      req,
    );
  }
  explore(req: {
    url: string;
    action: string;
    target?: Tier1Target;
    value?: string;
  }) {
    return this.req<{
      domDiff: string[];
      urlChangedTo?: string;
      screenshot?: string;
    }>("POST", "/api/author/explore", req);
  }
}
