# Gimbal CLI

Gimbal is a deterministic-first end-to-end testing platform for modern web
applications. The CLI starts the local core server, opens the dashboard, and
hosts the MCP control plane used by coding agents.

## Install

```bash
npx gimbal@alpha init
npx gimbal@alpha doctor
```

Gimbal requires Node.js 22 or newer. The first run downloads the local embedding model (about 25 MB).

## Commands

```bash
gimbal init                 # set up .gimbal/ and gimbal.config.json (safe to repeat)
gimbal doctor               # check Node, Chromium, the model, the server and your app
gimbal start                # start core and open the dashboard
gimbal mcp                  # start the MCP server over stdio
gimbal ground <test-id>     # ground a spec against the live application
gimbal test [test-id]       # run tests; --reporter list|json|junit, --bail, --strict
gimbal repair list|show|accept|reject|context
gimbal report <run-id>      # print a stored run report
gimbal stop                 # stop the local core server
```

`gimbal test` exits 0 when everything passed, 1 when a step failed, and 2 when nothing failed but a repair is waiting for review (1 with `--strict`).

The CLI does not author tests itself and does not execute test logic. It
communicates with the core server over REST and WebSocket APIs. Register
`gimbal mcp` with an MCP-compatible coding agent to author and repair tests.

See the [project README](https://github.com/dakshyadav1810/gimbal#readme) and
[documentation](https://github.com/dakshyadav1810/gimbal/tree/main/docs) for
the architecture and authoring workflow.
