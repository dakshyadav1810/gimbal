import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { MUTATIONS } from "./mutations.js";

export interface FixtureServer {
  port: number;
  setMutation(name: string | null, seed?: number): void;
  takeHits(): string[];
  close(): Promise<void>;
}

const HEAD = `<script>
window.__targets = {};
window.__hit = (id) => fetch("/__hit?t=" + encodeURIComponent(id), { keepalive: true });
function setLabel(el, text) {
  if (el.hasAttribute("aria-label")) { el.setAttribute("aria-label", text); return; }
  if (el.tagName === "INPUT" && el.parentElement && el.parentElement.tagName === "LABEL") {
    const n = el.parentElement.lastChild; if (n) n.textContent = " " + text; return;
  }
  el.textContent = text;
}
function gt(id, el) { window.__targets[id] = el; el.addEventListener("click", (e) => { e.preventDefault(); window.__hit(id); }); }
</script>`;

export async function startFixtureServer(
  root: string,
  targets: Record<string, any[]>,
): Promise<FixtureServer> {
  let mutation: string | null = null;
  let seed = 1;
  let hits: string[] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/__hit") {
      hits.push(url.searchParams.get("t") ?? "");
      res.end("ok");
      return;
    }
    const app = url.pathname.split("/")[1];
    const file = path.join(root, "apps", app, "index.html");
    if (!app || !fs.existsSync(file)) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    let html = fs.readFileSync(file, "utf8").replace("<head>", `<head>${HEAD}`);
    const m = MUTATIONS.find((x) => x.name === mutation);
    if (m) {
      // The mutated target id comes from ?target=; other targets stay untouched.
      const id = url.searchParams.get("target");
      const t = (targets[app] ?? []).find((x) => x.id === id);
      if (t) {
        const body = `(() => { const el = window.__targets[${JSON.stringify(id)}]; const t = ${JSON.stringify(t)}; const seed = ${seed}; if (!el) return; ${m.script} })();`;
        html = html.replace("</body>", `<script>${body}</script></body>`);
      }
    }
    res.setHeader("content-type", "text/html");
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    setMutation(name, s = 1) {
      mutation = name;
      seed = s;
    },
    takeHits() {
      const h = hits;
      hits = [];
      return h;
    },
    close: () => new Promise((r) => server.close(() => r())),
  };
}
