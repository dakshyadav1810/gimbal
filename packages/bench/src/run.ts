import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFixtureServer } from "./fixture-server.js";
import { MUTATIONS } from "./mutations.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const fixtures = path.join(repo, "fixtures");
const targets = JSON.parse(
  fs.readFileSync(path.join(fixtures, "apps/targets.json"), "utf8"),
);

type Outcome =
  | "correct-repair"
  | "incorrect-repair"
  | "correct-abstention"
  | "missed-repair"
  | "error";

async function startCore(): Promise<{
  proc: ChildProcess;
  base: string;
  dir: string;
}> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gimbal-bench-"));
  const port = 24000 + Math.floor(Math.random() * 3000);
  fs.writeFileSync(
    path.join(dir, "gimbal.config.json"),
    JSON.stringify({
      port,
      dbPath: path.join(dir, "cache.db"),
      artifactsDir: path.join(dir, "tests"),
      screenshotsDir: path.join(dir, "shots"),
      fixturesDir: path.join(dir, "fixtures"),
      timeouts: { actionMs: 2500, navMs: 10000 },
    }),
  );
  const proc = spawn("node", [path.join(repo, "packages/core/dist/main.js")], {
    cwd: dir,
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return { proc, base, dir };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error("core did not start");
}

async function api(base: string, method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      `${method} ${url} -> ${res.status} ${JSON.stringify(json)}`,
    );
  return json as any;
}

function classify(truth: string, hits: string[], id: string): Outcome {
  const acted = hits.length > 0;
  if (truth === "same")
    return hits.length === 1 && hits[0] === id
      ? "correct-repair"
      : acted
        ? "incorrect-repair"
        : "missed-repair";
  return acted ? "incorrect-repair" : "correct-abstention";
}

const only = process.env.BENCH_ONLY; // e.g. login-submit-removed, for debugging one cell
const core = await startCore();
const fx = await startFixtureServer(fixtures, targets);
const cells: unknown[] = [];
const tally: Record<string, Record<Outcome, number>> = {};
const t0 = Date.now();

try {
  for (const [app, list] of Object.entries(targets as Record<string, any[]>)) {
    for (const t of list) {
      for (const m of MUTATIONS) {
        const flowId = `${t.id}-${m.name}`;
        if (only && !flowId.startsWith(only)) continue;
        console.log(`> ${flowId}`);
        const spec = {
          version: "1.0",
          flow: {
            id: flowId,
            name: flowId,
            intent: `Click ${t.label}`,
            startUrl: `http://127.0.0.1:${fx.port}/${app}/?target=${t.id}`,
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
        let outcome: Outcome = "error";
        let evidence: unknown;
        try {
          fx.setMutation(null);
          const { testId } = await api(core.base, "POST", "/api/tests", spec);
          await api(core.base, "POST", `/api/tests/${testId}/ground`);
          fx.takeHits();
          fx.setMutation(m.name);
          const { runId } = await api(core.base, "POST", "/api/runs", {
            testId,
          });
          for (let i = 0; i < 120; i++) {
            const r = await api(core.base, "GET", `/api/runs/${runId}`).catch(
              () => null,
            ); // 404 until the run is stored
            if (r && r.status !== "running") break;
            await new Promise((r) => setTimeout(r, 500));
          }
          await new Promise((r) => setTimeout(r, 200));
          outcome = classify(m.truth, fx.takeHits(), t.id);
          const doc = JSON.parse(
            fs.readFileSync(
              path.join(core.dir, "tests", testId, "repairs.json"),
              "utf8",
            ),
          );
          const heal = doc.repairs.find(
            (r: { kind: string }) => r.kind === "heal",
          );
          evidence = heal && { ...heal.evidence, chose: heal.after?.label };
        } catch (e) {
          console.error(`  ${flowId}: ${(e as Error).message.slice(0, 160)}`);
        }
        cells.push({ cell: flowId, truth: m.truth, outcome, evidence });
        if (!tally[m.name]) {
          tally[m.name] = {
            "correct-repair": 0,
            "incorrect-repair": 0,
            "correct-abstention": 0,
            "missed-repair": 0,
            error: 0,
          };
        }
        tally[m.name][outcome]++;
      }
    }
  }
} finally {
  await fx.close();
  core.proc.kill();
  if (process.env.BENCH_KEEP) console.log(`kept ${core.dir}`);
  else fs.rmSync(core.dir, { recursive: true, force: true });
}

fs.mkdirSync(path.join(here, "../results"), { recursive: true });
fs.writeFileSync(
  path.join(here, "../results/cells-latest.json"),
  JSON.stringify(cells, null, 1),
);

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(
  `\n${pad("mutation", 18)}${pad("located", 9)}${pad("FP", 5)}${pad("abstain", 9)}${pad("missed", 8)}error`,
);
let fp = 0;
let located = 0;
let total = 0;
for (const [name, r] of Object.entries(tally)) {
  console.log(
    `${pad(name, 18)}${pad(r["correct-repair"], 9)}${pad(r["incorrect-repair"], 5)}${pad(r["correct-abstention"], 9)}${pad(r["missed-repair"], 8)}${r.error}`,
  );
  fp += r["incorrect-repair"];
  located += r["correct-repair"];
  total += Object.values(r).reduce((a, b) => a + b, 0);
}
console.log(
  `\ncells=${total} located=${located} false-positives=${fp} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
);
