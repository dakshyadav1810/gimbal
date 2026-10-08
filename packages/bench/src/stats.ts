export type Outcome =
  | "correct-repair"
  | "incorrect-repair"
  | "correct-abstention"
  | "missed-repair"
  | "error";

export interface Cell {
  cell: string;
  app: string;
  split: "train" | "test";
  mutation: string;
  truth: "same" | "removed" | "ambiguous";
  results: Record<string, Outcome>; // by system
  gimbalMs?: number;
}

export type Metric = "precision" | "fpRate" | "abstentionRate" | "recovery";

// Deterministic PRNG so a published interval can be reproduced exactly.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function metric(cells: Cell[], system: string, m: Metric): number {
  const o = cells.map((c) => ({ r: c.results[system], truth: c.truth }));
  const n = (x: Outcome) => o.filter((v) => v.r === x).length;
  const cr = n("correct-repair");
  const ir = n("incorrect-repair");
  switch (m) {
    case "precision":
      return cr + ir === 0 ? Number.NaN : cr / (cr + ir);
    case "fpRate":
      return o.length === 0 ? Number.NaN : ir / o.length;
    case "abstentionRate":
      return o.length === 0
        ? Number.NaN
        : (n("correct-abstention") + n("missed-repair")) / o.length;
    case "recovery": {
      const same = o.filter((v) => v.truth === "same").length;
      return same === 0 ? Number.NaN : cr / same;
    }
  }
}

export function bootstrapCI(
  cells: Cell[],
  system: string,
  m: Metric,
  iterations = 2000,
): [number, number] {
  const rand = rng(42);
  const vals: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const sample = Array.from(
      { length: cells.length },
      () => cells[Math.floor(rand() * cells.length)],
    );
    const v = metric(sample, system, m);
    if (!Number.isNaN(v)) vals.push(v);
  }
  if (vals.length === 0) return [Number.NaN, Number.NaN];
  vals.sort((a, b) => a - b);
  return [
    vals[Math.floor(0.025 * vals.length)],
    vals[Math.floor(0.975 * vals.length)],
  ];
}

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

const pct = (v: number) =>
  Number.isNaN(v) ? "n/a" : `${(v * 100).toFixed(0)}%`;

export function markdownTable(cells: Cell[], systems: string[]): string {
  const rows = [
    "| system | precision when acting | false-positive rate | abstention rate | recovery rate |",
    "|---|---|---|---|---|",
  ];
  for (const s of systems) {
    const col = (m: Metric) => {
      const v = metric(cells, s, m);
      const [lo, hi] = bootstrapCI(cells, s, m);
      return `${pct(v)} (${pct(lo)}–${pct(hi)})`;
    };
    rows.push(
      `| ${s} | ${col("precision")} | ${col("fpRate")} | ${col("abstentionRate")} | ${col("recovery")} |`,
    );
  }
  return rows.join("\n");
}
