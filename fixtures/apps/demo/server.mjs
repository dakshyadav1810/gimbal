// Demo A app: a small login page whose markup can be changed on demand, the way a redesign would.
// Run it by hand: node fixtures/apps/demo/server.mjs 3000, then visit /__set?m=label,wrap,classes
import http from "node:http";
import { fileURLToPath } from "node:url";

const MUTATIONS = new Set(["label", "wrap", "classes"]);

function loginPage(active) {
  const label = active.has("label") ? "Continue" : "Sign in";
  const btn = active.has("classes")
    ? `<button class="x9f-primary" type="submit">${label}</button>`
    : `<button id="signin-btn" class="btn btn-primary" type="submit">${label}</button>`;
  const form = `
    <form onsubmit="event.preventDefault(); location.href='/dashboard'">
      <label for="email">Email</label>
      <input id="email" type="text" autocomplete="off">
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="off">
      ${btn}
      <a href="/forgot">Forgot password?</a>
      <button type="button" class="${active.has("classes") ? "x9f-secondary" : "btn btn-link"}">Create account</button>
    </form>`;
  const body = active.has("wrap")
    ? `<div class="shell"><div class="card-wrap"><section class="panel-v2">${form}</section></div></div>`
    : form;
  return `<!doctype html><html><head><title>Acme</title></head><body><main><h1>Welcome back</h1>${body}</main></body></html>`;
}

const DASHBOARD =
  "<!doctype html><html><head><title>Acme dashboard</title></head><body><main><h1>Dashboard</h1><p>You are signed in.</p></main></body></html>";

export function startDemoServer(port = 0) {
  let active = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/__set") {
      active = new Set(
        (url.searchParams.get("m") ?? "")
          .split(",")
          .filter((m) => MUTATIONS.has(m)),
      );
      res.end(`mutations: ${[...active].join(",") || "none"}`);
      return;
    }
    res.setHeader("content-type", "text/html");
    if (url.pathname === "/login") res.end(loginPage(active));
    else if (url.pathname === "/dashboard") res.end(DASHBOARD);
    else {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({
        port: server.address().port,
        setMutations: (names) => {
          active = new Set(names);
        },
        close: () => new Promise((r) => server.close(() => r())),
      }),
    ),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startDemoServer(Number(process.argv[2] ?? 3000));
  console.log(`demo app on http://127.0.0.1:${s.port}/login`);
}
