import path from "node:path";

export function testDir(artifactsDir: string, testId: string): string {
  return path.join(artifactsDir, testId);
}
export function specPath(artifactsDir: string, testId: string): string {
  return path.join(testDir(artifactsDir, testId), "spec.json");
}
export function candidatesPath(artifactsDir: string, testId: string): string {
  return path.join(testDir(artifactsDir, testId), "candidates.json");
}
export function groundedPath(artifactsDir: string, testId: string): string {
  return path.join(testDir(artifactsDir, testId), "grounded.json");
}
export function ariaSnapshotPath(
  artifactsDir: string,
  testId: string,
): string {
  return path.join(testDir(artifactsDir, testId), "aria-snapshot.txt");
}
export function repairsPath(artifactsDir: string, testId: string): string {
  return path.join(testDir(artifactsDir, testId), "repairs.json");
}
