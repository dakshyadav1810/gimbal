// Demo A, scripted end to end with no model anywhere: init -> doctor -> author -> ground -> run ->
// the app changes -> run heals and is verified -> repair accept -> run again without healing ->
// JUnit report. Exits non-zero on any deviation, so CI can hold the product to this story.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startDemoServer } from "../../../fixtures/apps/demo/server.mjs";
import { api, repo, runAndWait, startCore } from "./harness.js";

// Async on purpose: the demo app runs in this process and must keep answering while the CLI runs.
const cli = (cwd: string, ...args: string[]) =>
  new Promise<{ out: string; code: number }>((resolve) => {
    execFile(
      "node",
      [path.join(repo, "packages/cli/dist/index.js"), ...args],
      { cwd, encoding: "utf8" },
      (err, stdout, stderr) =>
        resolve({
          out: `${stdout}${stderr}`,
          code: err ? ((err as { code?: number }).code ?? 1) : 0,
        }),
    );
  });

// Captures what the README shows: dashboard screenshots plus a terminal transcript, all built
// from this run's real data (nothing is mocked up).
async function record(
  outDir: string,
  base: string,
  appUrl: string,
  stepCount: number,
  proposal: any,
  testId: string,
) {
  fs.mkdirSync(outDir, { recursive: true });
  const ev = proposal.evidence;
  const lines = [
    `$ gimbal test`,
    `✓ grounded  Log in (${stepCount} steps)`,
    `✓ run passed`,
    ``,
    `— the app changes: "${proposal.before.label}" → "${proposal.after.label}", the form is wrapped, class names are renamed —`,
    ``,
    `$ gimbal test`,
    `✗ target not found: button "${proposal.before.label}"`,
    `↻ re-resolving  semantics ${ev.signals.semantics.toFixed(2)}  context ${ev.signals.context.toFixed(2)}  structure ${ev.signals.structure.toFixed(2)}`,
    `  chosen: ${proposal.after.role} "${proposal.after.label}"  confidence ${ev.confidence.toFixed(2)} (${ev.band}), runner-up "${ev.runnerUp?.label}" at ${ev.runnerUp?.score.toFixed(2)}`,
    `✓ outcome verified (${proposal.verification.level}): the step's own assertion passed`,
    `⚑ repair proposed   gimbal repair show ${proposal.id.slice(0, 8)}`,
    `REVIEW  Log in`,
    ``,
    `$ echo $?`,
    `2`,
  ];
  fs.writeFileSync(
    path.join(outDir, "demo-terminal.txt"),
    `${lines.join("\n")}\n`,
  );
  const { launch } = await import("./baselines.js");
  const browser = await launch();
  try {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({
        viewport: { width: 1000, height: 560 },
        colorScheme: scheme,
      });
      const page = await ctx.newPage();
      await page.goto(`${base}/repairs`);
      await page.getByText("Verified by").waitFor();
      await page.screenshot({
        path: path.join(outDir, `repairs-${scheme}.png`),
      });
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`recorded to ${outDir}`);
}

let step = 0;
function check(cond: unknown, what: string, detail = ""): asserts cond {
  step++;
  if (!cond) {
    console.error(`✗ ${step}. ${what}${detail ? `\n${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`✓ ${step}. ${what}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gimbal-demo-"));
const app = await startDemoServer(0);
const appUrl = `http://127.0.0.1:${app.port}`;
let core: Awaited<ReturnType<typeof startCore>> | undefined;

try {
  const init = await cli(dir, "init");
  check(
    init.out.includes("created") &&
      fs.existsSync(path.join(dir, ".gimbal/.gitignore")),
    "gimbal init sets up the project",
  );
  const again = await cli(dir, "init");
  check(!again.out.includes("created"), "gimbal init is safe to run again");

  core = await startCore({ appUrl }, dir);
  const doctor = await cli(dir, "doctor");
  check(
    doctor.code === 0 && doctor.out.includes("Ready."),
    "gimbal doctor reports ready",
    doctor.out,
  );

  // Author: what an agent would submit. Targets are described by meaning, never by selector.
  const target = (
    label: string,
    role: string,
    semantics: string[],
    intent: string,
    action: string,
  ) => ({
    label,
    role,
    semantics,
    actions: [action],
    intent,
  });
  const spec = {
    version: "1.0",
    flow: {
      id: "demo-login",
      name: "Log in",
      intent: "A user signs in and lands on the dashboard",
      startUrl: `${appUrl}/login`,
      vars: {},
    },
    steps: [
      {
        id: "email",
        kind: "ui",
        action: "type",
        value: "ada@example.com",
        intent: "enter email",
        target: target(
          "Email",
          "textbox",
          ["email", "e-mail address"],
          "enter email",
          "type",
        ),
      },
      {
        id: "password",
        kind: "ui",
        action: "type",
        value: "correct-horse",
        intent: "enter password",
        target: target(
          "Password",
          "textbox",
          ["password"],
          "enter password",
          "type",
        ),
      },
      {
        id: "submit",
        kind: "ui",
        action: "click",
        intent: "submit the login form",
        target: target(
          "Sign in",
          "button",
          ["sign in", "log in", "continue", "submit"],
          "submit the login form",
          "click",
        ),
        assertions: [{ type: "urlContains", expected: "/dashboard" }],
      },
    ],
  };
  const { testId } = await api(core.base, "POST", "/api/tests", spec);
  const ground = await api(core.base, "POST", `/api/tests/${testId}/ground`);
  check(
    !ground.stoppedAt,
    "the spec grounds against the live app",
    JSON.stringify(ground.ungrounded),
  );

  const first = await runAndWait(core.base, testId);
  check(
    first.status === "passed" &&
      first.steps.every((s: any) => s.selection !== "resolver"),
    "baseline run passes without healing",
  );

  // The app changes: label, wrapper and class names, the way a redesign would.
  app.setMutations(["label", "wrap", "classes"]);
  const healed = await runAndWait(core.base, testId);
  const submit = healed.steps.find((s: any) => s.stepId === "submit");
  check(
    healed.status === "passed" && submit?.selection === "resolver",
    "after the redesign, the run heals and still passes",
    JSON.stringify(healed.steps),
  );

  const repairs = await api(core.base, "GET", `/api/repairs?testId=${testId}`);
  const proposal = repairs.find(
    (r: any) => r.kind === "heal" && r.status === "proposed",
  );
  check(
    proposal?.after?.label === "Continue",
    "a repair is proposed: Sign in -> Continue",
    JSON.stringify(repairs),
  );
  check(
    proposal.verification?.level === "outcome" &&
      proposal.verification?.result === "verified",
    "the proposal was verified against the step's own outcome",
  );

  if (process.env.DEMO_RECORD) {
    await record(
      process.env.DEMO_RECORD,
      core.base,
      appUrl,
      spec.steps.length,
      proposal,
      testId,
    );
  }

  if (process.env.DEMO_HOLD) {
    // For screenshots: leave the app and core running with the proposal open.
    console.log(
      `\nHolding with an open proposal. Dashboard: ${core.base}/repairs  App: ${appUrl}/login`,
    );
    await new Promise(() => {});
  }

  const list = await cli(dir, "repair", "list");
  check(list.out.includes("Continue"), "gimbal repair list shows it", list.out);

  const accept = await cli(dir, "repair", "accept", proposal.id.slice(0, 8));
  check(
    accept.code === 0 && accept.out.includes("accepted"),
    "gimbal repair accept succeeds",
    accept.out,
  );

  const grounded = await api(core.base, "GET", `/api/tests/${testId}`);
  const groundedSubmit = grounded.steps.find((s: any) => s.id === "submit");
  check(
    groundedSubmit.target.resolution.winner.label === "Continue",
    "the accepted repair is folded into grounded.json",
  );

  const after = await runAndWait(core.base, testId);
  const afterSubmit = after.steps.find((s: any) => s.stepId === "submit");
  check(
    after.status === "passed" && afterSubmit.selection !== "resolver",
    "the next run passes without healing",
  );

  const junit = await cli(dir, "test", "--reporter", "junit");
  check(
    junit.code === 0 &&
      junit.out.includes("<testsuite") &&
      junit.out.includes('failures="0"'),
    "gimbal test --reporter junit exits 0 with a clean report",
    junit.out,
  );

  console.log("\nDemo A verified.");
} finally {
  core?.stop();
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
