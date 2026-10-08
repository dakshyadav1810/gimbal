import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

export function useTests() {
  return useQuery({ queryKey: ["tests"], queryFn: api.listTests });
}

export function useTest(testId: string) {
  return useQuery({
    queryKey: ["tests", testId],
    queryFn: () => api.getTest(testId),
  });
}

export function useRuns(testId: string) {
  return useQuery({
    queryKey: ["tests", testId, "runs"],
    queryFn: () => api.listRuns(testId),
  });
}

export function useRun(runId: string) {
  return useQuery({
    queryKey: ["runs", runId],
    queryFn: () => api.getReport(runId),
    // Poll while the run is in flight so a fresh Run click shows live progress even without the
    // WebSocket connection; stop once it reaches a final status.
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 1000 : false,
  });
}

export function useReviews() {
  return useQuery({ queryKey: ["reviews"], queryFn: api.listReviews });
}

export function useTestReviews(testId: string) {
  return useQuery({
    queryKey: ["tests", testId, "reviews"],
    queryFn: () => api.listTestReviews(testId),
  });
}

export function useTestCandidates(testId: string) {
  return useQuery({
    queryKey: ["tests", testId, "candidates"],
    queryFn: () => api.getCandidates(testId),
  });
}

export function useRepairPayload(testId: string) {
  return useQuery({
    queryKey: ["tests", testId, "repair"],
    queryFn: () => api.getRepairContext(testId),
    enabled: false,
  });
}
