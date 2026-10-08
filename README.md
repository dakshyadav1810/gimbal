# Gimbal

![License: BUSL-1.1](https://img.shields.io/badge/license-BUSL--1.1-blue.svg)

Gimbal is a local-first, deterministic end-to-end testing platform for modern
web applications. It replaces brittle selectors with a multi-signal resolver
that can re-locate elements when a UI changes, without calling an LLM during a
test run.

> **Status:** pre-release. The npm package is being prepared for public
> distribution and the API may change before 1.0.

## Why Gimbal

Traditional browser tests usually persist one selector for each element. A
class rename or DOM reshuffle then creates maintenance work unrelated to the
behavior under test. Gimbal stores semantic intent separately from live DOM
anchors and resolves targets using:

- **Semantics** — meaning and accessible names, including local embeddings.
- **Affordance** — visibility, enabled state, and action compatibility.
- **Structure** — roles, test IDs, IDs, tags, and structural identity.
- **Context** — ancestors, regions, nearby text, and spatial relationships.
- **Index** — positional information as a final tie-breaker.

The runtime is deterministic and local. A failed cached selector triggers a
deterministic re-grounding attempt; if confidence remains too low, the step is
marked stale for review.

## Quick start

### From npm

Once the package is published:

```bash
npx gimbal init
npx gimbal start
```

`start` runs the local Fastify core server and opens the dashboard. It does not
start the MCP server.

### From a checkout

```bash
corepack enable
pnpm install
pnpm build
pnpm --filter @gimbal/core exec playwright install chromium
pnpm --filter gimbal dev init
pnpm --filter gimbal dev start
```

The application under test must already be running. Gimbal drives it through
Playwright; it does not start the application for you.

## Coding-agent workflow

Register the MCP entry point with an MCP-compatible coding agent:

```bash
claude mcp add gimbal -- npx gimbal mcp
```

The agent can then:

1. Call `getMap` for route-scoped application context.
2. Submit a DOM-blind `SpecIR` through `submitSpec`.
3. Ground the spec against the live application.
4. Run it and inspect the report.
5. Request maintenance context for stale steps and submit a corrected spec.

Gimbal does not hold an LLM provider key or call a model provider. The
connected coding agent authors and repairs specifications through MCP.

## CLI reference

```text
gimbal init                 Create .gimbal/ and gimbal.config.json
gimbal start                Start core and open the dashboard
gimbal mcp                  Start the MCP server over stdio
gimbal ground <test-id>     Ground a test against the live application
gimbal test [test-id]       Run one test or the complete suite
gimbal heal <test-id>       Print maintenance context for a stale test
gimbal report <run-id>      Print a stored run report
gimbal stop                 Stop the local core server
```

Configuration is read from `gimbal.config.json`, with environment variables
such as `GIMBAL_PORT` taking precedence. Project state is stored under
`.gimbal/`; it should not be committed except for versioned test artifacts.

## Architecture

```text
Coding agent ── MCP/stdio ──▶ CLI ── REST/WebSocket ──▶ Core
                                                       │
                                                       ├─ Playwright
                                                       ├─ Resolver
                                                       ├─ Grounding
                                                       └─ SQLite cache
Dashboard ─────────────── REST/WebSocket ─────────────▶ Core
```

The monorepo contains:

- `packages/shared` — shared Zod schemas and TypeScript types.
- `packages/core` — Fastify server and all execution/business logic.
- `packages/cli` — published `gimbal` CLI and MCP control plane.
- `packages/dashboard` — Vite/React client bundled and served by core.

Tests are JSON artifacts. The dashboard and CLI are clients; execution belongs
to core.

## Documentation

Start with [the documentation index](docs/README.md). It links the product
specifications, implementation designs, architectural decisions, contributor
guidance, and the agent workflow.

- [Engineering and agent guidance](AGENTS.md)
- [Contributing](CONTRIBUTING.md)
- [Using Gimbal in another repository](docs/USING_GIMBAL_IN_ANOTHER_REPO.md)
- [Architectural decisions](docs/adr)
- [Product specifications](docs/specs)
- [Low-level designs](docs/lld)

## Development

```bash
pnpm build
pnpm test
pnpm lint
pnpm pack:cli
```

The last command creates an npm tarball for inspection without publishing it.
Before a release, verify the tarball contents and test it in a clean temporary
project with `npm install /path/to/gimbal-*.tgz`.

## License

Gimbal is licensed under the Business Source License 1.1. See [LICENSE](LICENSE).
