# Architecture

Gimbal is one TypeScript codebase on Node 22, as a pnpm workspace.

```
packages/
  shared/     Zod schemas: the one definition of the Spec IR, grounded test, repairs, config and API shapes
  core/       local server: grounding, resolver, execution, healing, repairs, storage, REST + WebSocket
  cli/        the `gimbal` command and the MCP server
  dashboard/  Vite + React single-page app, built into core and served by it
```

## Process model

`gimbal mcp` and `gimbal start` talk to a **core** process on `127.0.0.1` over REST. Core owns Playwright, the resolver, SQLite and the files under `.gimbal/`. The CLI and MCP server never run tests or import core code. The dashboard only reads and decides repairs.

```
agent --MCP--> gimbal mcp --REST--> core --Playwright--> Chromium
dashboard ------------------REST/WS--^
```

## Invariants

1. Core owns execution. The CLI, MCP server and dashboard do not.
2. Tests are JSON. Gimbal does not generate Playwright scripts as its primary artifact.
3. Packages communicate only through REST and WebSocket.
4. **At run time, Gimbal calls no generative model and no external model service.** A local, frozen embedding model is allowed, because its output depends only on its pinned weights and its input.
5. Healing is bounded: one re-resolution per step per attempt, never a loop.
6. Everything Gimbal changes about a test is a reviewable file.

## Where things are stored

```
.gimbal/
  tests/<id>/spec.json          what the agent authored
              grounded.json     spec plus resolved selectors and evidence
              candidates.json   what grounding considered (privacy-filtered)
              repairs.json      heals and abstentions, with decisions
  cache.db                      selector cache, run history, embeddings (git-ignored)
  screenshots/  snapshots/      git-ignored
```

## Execution of one UI step

1. Cached selector for this DOM, if it still matches exactly one visible element.
2. The selector stored in `grounded.json`, same check.
3. A still-open, verified repair proposal for this step.
4. Otherwise heal (unless `healing.mode` is `off`): re-extract the page, score candidates, apply the ambiguity rule.
5. Wait for the element to be stable and un-occluded, act, then verify if the selector came from a heal.

## Extension points

Each subsystem sits behind an interface and is composed in `packages/core/src/server/container.ts`: the artifact store, the cache, the resolver and its signals, the embedding model, the grounding service, the healing service and the snapshot store.
