import type {
  CandidatesDoc,
  GroundedTest,
  RepairPayload,
  ReviewRecord,
  RunReport,
  RunSummary,
  SpecIR,
} from "@gimbal/shared";

export interface TestSummary {
  testId: string;
  name: string;
  grounded: boolean;
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
  listReviews: () => req<ReviewRecord[]>("/reviews"),
  listTestReviews: (testId: string) =>
    req<ReviewRecord[]>(`/tests/${testId}/reviews`),
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
