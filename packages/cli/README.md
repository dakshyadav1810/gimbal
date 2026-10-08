# Gimbal CLI

Gimbal is a deterministic-first end-to-end testing platform for modern web
applications. The CLI starts the local core server, opens the dashboard, and
hosts the MCP control plane used by coding agents.

## Install

```bash
npx gimbal init
```

Gimbal requires Node.js 22 or newer. The first run may download the local
embedding model used by the resolver.

## Commands

```bash
gimbal init                 # create .gimbal/ and gimbal.config.json
gimbal start                # start core and open the dashboard
gimbal mcp                  # start the MCP server over stdio
gimbal ground <test-id>    # ground a spec against the live application
gimbal test [test-id]      # run one test or the complete suite
gimbal heal <test-id>      # print maintenance context for a stale test
gimbal report <run-id>     # print a stored run report
gimbal stop                 # stop the local core server
```

The CLI does not author tests itself and does not execute test logic. It
communicates with the core server over REST and WebSocket APIs. Register
`gimbal mcp` with an MCP-compatible coding agent to author and maintain tests.

See the [project README](https://github.com/dakshyadav1810/gimbal#readme) and
[documentation](https://github.com/dakshyadav1810/gimbal/tree/main/docs) for
the architecture and authoring workflow.
