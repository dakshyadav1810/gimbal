import type {
  CandidatesDoc,
  GroundedTest,
  Repair,
  RepairPayload,
  RunReport,
  RunSummary,
  SpecIR,
} from "@gimbal/shared";

export interface TestSummary {
  testId: string;
  name: string;
  grounded: boolean;
  lastRun: {
    runId: string;
    outcome: "running" | "passed" | "failed" | "review";
    finishedAt: string;
  } | null;
  openRepairs: number;
}

// All REST routes live under /api — the bare paths (/tests, /reviews, ...) are reserved for the
// dashboard's own client-side routes so the two don't collide (see DECISIONS.md #11/#12).
async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `${path} -> ${res.status}`);
  }
  return res.json();
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  listTests: () => req<TestSummary[]>("/tests"),
  getTest: (id: string) => req<GroundedTest | SpecIR>(`/tests/${id}`),
  runTest: (testId: string) =>
    req<{ runId: string }>("/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ testId }),
    }),
  getReport: (runId: string) => req<RunReport>(`/runs/${runId}`),
  listRuns: (testId: string) => req<RunSummary[]>(`/tests/${testId}/runs`),
  listRepairs: () => req<Repair[]>("/repairs"),
  acceptRepair: (id: string) => req<Repair>(`/repairs/${id}/accept`, post({})),
  rejectRepair: (id: string, reason?: string) =>
    req<Repair>(`/repairs/${id}/reject`, post({ reason })),
  getRepairContext: (testId: string) =>
    req<RepairPayload>(`/tests/${testId}/repair-context`),
  getCandidates: (testId: string) =>
    req<CandidatesDoc | null>(`/tests/${testId}/candidates`),
  updateSpec: (testId: string, spec: SpecIR) =>
    req<{ testId: string; spec: SpecIR }>(`/tests/${testId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    }),
};

export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
