# Using Gimbal in another repo

Gimbal is **pre-release** — not on npm yet (see the root [README](../README.md#quick-start)). To use it
against a different project's codebase today, you run this repo's built CLI and point it at that other
project's working directory. This doc covers that cross-repo setup end to end.

## 1. Build Gimbal once

In this repo (`gimbal`):

```bash
pnpm install
pnpm build
```

This produces `packages/cli/dist/index.js`, an executable Node script (`bin: gimbal`, per
[packages/cli/package.json](../packages/cli/package.json)).

## 2. Make the `gimbal` command available in the target repo

Pick one:

### Option A — global link (recommended for repeated use)

```bash
# in gimbal/packages/cli
pnpm link --global

# in your target project
pnpm link --global @gimbal/cli
```

Now `gimbal` resolves on `PATH` inside the target repo.

### Option B — invoke the built script directly (no linking)

```bash
# from inside your target project's root
node /absolute/path/to/gimbal/packages/cli/dist/index.js init
node /absolute/path/to/gimbal/packages/cli/dist/index.js start
```

(For registering Gimbal with a coding agent's MCP client instead of running it yourself, see
[step 5](#5-connect-your-coding-agent-over-mcp): that path uses `gimbal mcp`, not `gimbal start`.)

Useful for a one-off check without touching global package state. Substitute this for every `gimbal ...`
command below if you go this route.

## 3. Initialize the target repo

From the target project's root:

```bash
gimbal init
```

This scaffolds `.gimbal/tests/` and a `gimbal.config.json` (default `{ "port": 4319 }`) in that repo —
see [packages/cli/src/commands.ts](../packages/cli/src/commands.ts). Commit `.gimbal/` and
`gimbal.config.json` to the target repo; specs are JSON and are meant to be version-controlled there,
not in this repo.

If the target repo already uses port 4319 for something else, set:

```bash
export GIMBAL_PORT=4320   # env overrides gimbal.config.json, per packages/cli/src/config.ts
```

## 4. Start Gimbal against the target app

With the target app itself already running locally (Gimbal drives it via Playwright — it doesn't start
your app for you), if you want to run Gimbal yourself as a human (not via an MCP client, see
[step 5](#5-connect-your-coding-agent-over-mcp) for that):

```bash
gimbal start
```

This, from the target repo's directory:

- spawns the core (Fastify) server at `http://127.0.0.1:4319`, but only if one isn't already running
  (`gimbal start` is idempotent: it checks `/health` first and skips spawning if core is already alive)
- opens the dashboard in your browser, served from that same server
- does **not** host an MCP server; MCP is a separate command (`gimbal mcp`, see below), since a human
  running `start` directly has no MCP client to talk over stdio to

## 5. Connect your coding agent over MCP

Gimbal has no LLM of its own — authoring only happens through your coding agent calling the exposed MCP
tools (`getMap`, `submitSpec`, `groundTest`, `runTest`, `getReport`, `heal`/repair payload, `updateTest`;
see [packages/cli/src/mcp/server.ts](../packages/cli/src/mcp/server.ts)).

MCP clients (like Claude Code) spawn the registered command fresh on every session or reconnect, so the
command you register must **not** be `start`: it would open a new browser tab (and, if core died since the
last connect, might race with a stale pidfile) every single time. Use the dedicated `gimbal mcp` command
instead: it only starts the MCP stdio server, connects to an already-running core, silently spawns one in
the background if `isCoreAlive` says none is running, and never opens the dashboard.

For **Claude Code**, register it as a stdio MCP server from the target repo:

```bash
claude mcp add gimbal -- node /absolute/path/to/gimbal/packages/cli/dist/index.js mcp
```

(Or `gimbal mcp` in place of the `node ...` invocation if you did the global link in step 2.)

Then, in a Claude Code session in the target repo, just describe intent in plain language:

```
"Test the login flow"
```

The agent calls `submitSpec` to author a DOM-blind spec, `groundTest` to resolve it against the live app,
and `runTest`/`getReport` to execute and report — all through the MCP tools, never by writing Playwright
code directly (see [AGENTS.md](../AGENTS.md), invariant #2).

## 6. Day-to-day commands (from the target repo)

```bash
gimbal ground <testId>   # re-ground an existing spec against the current DOM
gimbal test [testId]     # run one test or the whole suite; exits non-zero on failure — CI-friendly
gimbal heal <testId>     # print the repair payload for a stale test (read-only, no LLM call)
gimbal report <runId>    # print a stored run report
gimbal stop              # graceful shutdown of the core process
```

## Killing stray processes

Whichever command spawned it (`gimbal start` or `gimbal mcp`, whenever core wasn't already alive), core
runs as a detached background child with its PID recorded in `.gimbal/gimbal.pid` (scoped to whichever
repo you ran it from — see
[packages/cli/src/core-process.ts](../packages/cli/src/core-process.ts)). `gimbal stop` works the same way
regardless of which command started core: it just reads that file and sends `SIGTERM`:

```bash
gimbal stop
```

This is enough in the normal case. It falls short if the pid file is stale — e.g. the process died some
other way, or the file was left over from a previous rename/rebuild — since `stopCore()` silently no-ops
when the recorded PID is already dead, and leaves an orphan running if the file itself is missing or
wrong. If `gimbal stop` reports `"no running core found"` but something is still holding the port, fall
back to a manual lookup:

```bash
# find whatever is bound to the configured port (default 4319)
lsof -i :4319

# inspect it before killing — confirm it's actually a Gimbal/core process, not something unrelated
ps -p <PID> -o pid,ppid,etime,command

# then terminate it
kill <PID>          # SIGTERM — graceful
kill -9 <PID>        # only if SIGTERM doesn't work after a few seconds
```

If the pid file is stale (points at a PID that's no longer core, or no longer exists), remove it so a
future `gimbal stop` doesn't act on bad data:

```bash
rm .gimbal/gimbal.pid
```

Always confirm with `ps` before killing anything found this way — port 4319 could coincidentally be held
by an unrelated process, and `.gimbal/` directories can persist across repo renames or moves.

## Notes / limitations

- Nothing here is Gimbal-specific to *this* repo's app — `.gimbal/` and `gimbal.config.json` live in the
  target project, and all state (SQLite cache, run history) is scoped to wherever `gimbal start` is run
  from.
- Because the CLI isn't published, every target repo needs its own link/path setup after you rebuild this
  repo — there's no version pinning yet. Once `npx gimbal` is live (see root README), this whole doc
  collapses to `npx gimbal init && npx gimbal start`.
- The resolver and execution engine run entirely local — no data about the target app leaves your
  machine except through whatever LLM your coding agent already talks to (Claude, GPT, ...); Gimbal
  itself holds no API key and makes no model calls.
