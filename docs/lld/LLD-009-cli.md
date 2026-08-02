# LLD-009: CLI Orchestrator (`packages/cli`)

**Status:** Draft
**Implements:** [SPEC-005](../specs/SPEC-005-mcp-cli-dashboard.md), [ADR-003 §6](../adr/ADR-003.md), [PLAN-001](../PLAN-001.md)
**Depends on:** [LLD-008](./LLD-008-mcp-server.md) (MCP host), [LLD-001](./LLD-001-shared-ir.md) (config/DTOs)

> `npx gimbal` — the process a developer or agent starts, split by audience into two entrypoints:
> `gimbal start` (developer-facing: orchestrates lifecycle, spawning and health-checking the core server
> idempotently, then opens the dashboard) and `gimbal mcp` (agent-facing: hosts the MCP control plane over
> stdio, connecting to an already-running core and spawning one in the background only if needed, never
> opening the dashboard). The split exists because an MCP client respawns its registered command on every
> session/reconnect, so the agent-facing command can't carry `start`'s dashboard-opening side effect. It
> contains **no execution logic** (invariants #4/#6): every command is a REST/WS call into core.

---

## 1. Module shape

```
packages/cli/src/
├── index.ts            # commander program (entry: bin "gimbal")
├── commands/           # init | start | mcp | stop | ground | test | heal | report
├── core-process.ts     # spawn + health-check + shutdown the core server (execa)
├── client.ts           # typed REST/WS client for core (uses shared DTOs)
├── mcp/server.ts       # @modelcontextprotocol/sdk stdio server (LLD-008)
└── config.ts           # load + validate GimbalConfig (node --env-file)
```

## 2. Command surface (commander)

| Command | Does | Calls |
|---|---|---|
| `gimbal init` | scaffold `.gimbal/` + `gimbal.config.json` | local FS |
| `gimbal start` | spawn core if not already alive (idempotent), serve+open dashboard; never hosts MCP | `core-process` |
| `gimbal mcp` | start MCP (stdio) for a coding agent; spawn core in the background only if not already alive; never opens the dashboard | `core-process` + `mcp/server` |
| `gimbal stop` | graceful shutdown of core | `core-process` |
| `gimbal ground <testId>` | first-run grounding | `POST /tests/:id/ground` |
| `gimbal test [<testId>]` | run test / suite; print report; stream to dashboard | `POST /runs` + `GET /ws/runs/:id` |
| `gimbal heal <testId>` | print the repair payload for a stale test | `GET /tests/:id/repair` |
| `gimbal report <runId>` | print a stored run report | `GET /runs/:id` |

`gimbal test` sets the process exit code from the run verdict (0 pass / non-zero fail) for CI use.

**There is no `gimbal author` command.** Gimbal has no LLM client of its own, so there is nothing a bare CLI
invocation could call to generate a spec — authoring only happens through a connected agent's `submitSpec`
MCP call (SPEC-001 §2). `gimbal heal` is read-only for the same reason: it fetches and prints the repair
payload (`{ specIR, testCase, kdg }`) so the developer can hand it to their agent; it does not attempt a
repair itself.

## 3. Lifecycle (`core-process.ts`, `execa`)

`core-process.ts` exports `isCoreAlive(config)` (checks core's `/health` endpoint) and `startCore(config,
coreEntry)` (spawns core, writes `.gimbal/gimbal.pid`), used by both commands but composed differently:

```ts
// gimbal start (developer-facing)
async function start() {
  if (!(await isCoreAlive(config))) {
    await startCore(config, coreEntry);   // spawn + health-check, write pidfile
  }
  await open(`http://127.0.0.1:${GIMBAL_PORT}/`);   // dashboard served by core; always runs
}

// gimbal mcp (agent-facing)
async function mcp() {
  if (!(await isCoreAlive(config))) {
    await startCore(config, coreEntry);   // silent background spawn, no dashboard
  }
  await mcp.start();   // stdio MCP server, proxying to core; blocks, never opens a browser
}
```

- Core is a child process; the CLI supervises it (health poll, restart-on-crash optional, clean SIGTERM).
- In both `start` and `mcp`, the dashboard open / MCP server start only happens after `/health` passes
  (whether core was already alive or freshly spawned).
- The dashboard is **served by core** (static assets); the CLI only opens the URL, and only from `start`.

## 4. Core client (`client.ts`)

A thin typed wrapper over `fetch`/`undici` + `WebSocket`, using the `shared` DTOs so requests/responses
are validated on the CLI side too. This is the *only* way the CLI talks to core — there is no direct
import of core internals (invariant #7).

## 5. MCP host (`mcp/server.ts`)

Starts the stdio MCP server (LLD-008) and registers the tool set. Each tool handler uses `client.ts` to
call core; tool schemas are the `shared` Zod types. The MCP server shares the CLI's config/session (auth
token, base URL) but holds no state of its own.

## 6. Config (`config.ts`)

`GimbalConfig` (LLD-001 §7) is loaded via `node --env-file` + `gimbal.config.json`, validated with Zod, and
passed to the spawned core via env. Precedence: CLI flags → env → `gimbal.config.json` → defaults.

## 7. Boundaries

- No Playwright, no resolver, no DB in the CLI (invariant #4).
- The CLI is disposable: killing it stops orchestration; core + artifacts persist independently.
- Distributed as an `npx`-runnable bin; `npx gimbal` is the only install step (ADR-003).
