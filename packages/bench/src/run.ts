import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, launch, runBaseline } from "./baselines.js";
import { startFixtureServer } from "./fixture-server.js";
import { api, repo, runAndWait, startCore } from "./harness.js";
import { MUTATIONS } from "./mutations.js";
import { type Cell, type Outcome, markdownTable, quantile } from "./stats.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(repo, "fixtures");
const targets = JSON.parse(
  fs.readFileSync(path.join(fixtures, "apps/targets.json"), "utf8"),
) as Record<string, any[]>;
const split = JSON.parse(
  fs.readFileSync(path.join(fixtures, "apps/split.json"), "utf8"),
) as { train: string[]; test: string[] };

const arg = (name: string, dflt: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const want = arg("split", "all"); // train | test | all
const only = process.env.BENCH_ONLY; // flow id prefix, for debugging one cell
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 4);
const SYSTEMS = ["stored selector", "role + name", "Gimbal"];

const core = await startCore({ dbPath: "cache.db", artifactsDir: "tests" });
const browser = await launch();

async function runCell(
  app: string,
  t: any,
  m: (typeof MUTATIONS)[number],
): Promise<Cell> {
  const flowId = `${t.id}-${m.name}`;
  const cellSplit = split.train.includes(app) ? "train" : "test";
  const cell: Cell = {
    cell: flowId,
    app,
    split: cellSplit,
    mutation: m.name,
    truth: m.truth,
    results: {},
  };
  const fx = await startFixtureServer(path.join(fixtures), targets);
  const url = `http://127.0.0.1:${fx.port}/${app}/?target=${t.id}`;
  try {
    const spec = {
      version: "1.0",
      flow: {
        id: flowId,
        name: flowId,
        intent: `Click ${t.label}`,
        startUrl: url,
        vars: {},
      },
      steps: [
        {
          id: "s1",
          kind: "ui",
          action: "click",
          intent: `click ${t.label}`,
          target: {
            label: t.label,
            role: t.role,
            semantics: t.semantics,
            actions: ["click"],
            intent: `click ${t.label}`,
          },
        },
        {
          id: "s2",
          kind: "ui",
          action: "wait",
          intent: "page still open",
          assertions: [{ type: "urlContains", expected: "target=" }],
        },
      ],
    };
    const { testId } = await api(core.base, "POST", "/api/tests", spec);
    await api(core.base, "POST", `/api/tests/${testId}/ground`);
    const grounded = JSON.parse(
      fs.readFileSync(
        path.join(core.dir, "tests", testId, "grounded.json"),
        "utf8",
      ),
    );
    const stored: string | undefined =
      grounded.steps[0]?.target?.resolution?.cachedSelector;
    fx.takeHits();
    fx.setMutation(m.name);

    const t0 = Date.now();
    await runAndWait(core.base, testId);
    cell.gimbalMs = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 250));
    cell.results.Gimbal = classify(m.truth, fx.takeHits(), t.id);

    const viaStored = stored
      ? await runBaseline(browser, url, (p) => p.locator(stored))
      : "abstained";
    await new Promise((r) => setTimeout(r, 100));
    cell.results["stored selector"] =
      viaStored === "acted"
        ? classify(m.truth, fx.takeHits(), t.id)
        : classify(m.truth, [], t.id);
    fx.takeHits();

    const viaRole = await runBaseline(browser, url, (p) =>
      p.getByRole(t.role, { name: t.label }),
    );
    await new Promise((r) => setTimeout(r, 100));
    cell.results["role + name"] =
      viaRole === "acted"
        ? classify(m.truth, fx.takeHits(), t.id)
        : classify(m.truth, [], t.id);
  } catch (e) {
    console.error(`  ${flowId}: ${(e as Error).message.slice(0, 160)}`);
    for (const s of SYSTEMS) cell.results[s] ??= "error" as Outcome;
  } finally {
    await fx.close();
  }
  return cell;
}

const jobs: Array<() => Promise<Cell>> = [];
for (const [app, list] of Object.entries(targets)) {
  const appSplit = split.train.includes(app) ? "train" : "test";
  if (want !== "all" && want !== appSplit) continue;
  for (const t of list)
    for (const m of MUTATIONS) {
      if (only && !`${t.id}-${m.name}`.startsWith(only)) continue;
      if (process.env.BENCH_MUTATION && m.name !== process.env.BENCH_MUTATION)
        continue;
      jobs.push(() => runCell(app, t, m));
    }
}

const cells: Cell[] = [];
const t0 = Date.now();
try {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        cells.push(await job());
        process.stdout.write(`\r${cells.length}/${jobs.length} cells`);
      }
    }),
  );
} finally {
  await browser.close();
  core.stop(Boolean(process.env.BENCH_KEEP));
}
console.log("");

const out = path.join(here, "../results");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "bench-latest.json"),
  JSON.stringify(cells, null, 1),
);
const secs = cells.map((c) => (c.gimbalMs ?? 0) / 1000);
const sections = (["train", "test"] as const)
  .filter((s) => cells.some((c) => c.split === s))
  .map((s) => {
    const sub = cells.filter((c) => c.split === s);
    return `### ${s === "test" ? "Held-out apps" : "Tuning apps"} (${sub.length} cases, apps: ${[...new Set(sub.map((c) => c.app))].join(", ")})\n\n${markdownTable(sub, SYSTEMS)}`;
  });
const md = `## Healing benchmark\n\n${sections.join("\n\n")}\n\nOutcomes are per (target, mutation) case; intervals are 95% bootstrap over cases. Median Gimbal run time per case: ${quantile(secs, 0.5).toFixed(1)}s (p95 ${quantile(secs, 0.95).toFixed(1)}s, includes browser start).\n`;
fs.writeFileSync(path.join(out, "bench-latest.md"), md);
console.log(md);
console.log(
  `${cells.length} cases in ${((Date.now() - t0) / 1000).toFixed(0)}s`,
);
