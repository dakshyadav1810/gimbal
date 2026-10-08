# Changelog

## 0.1.0-alpha.0

First alpha.

- Tests are JSON describing intent; Gimbal grounds them against your running app and runs them in Chromium.
- Runs heal a stale selector, verify the result, and record it as a repair you accept or reject (`gimbal repair`, dashboard).
- Steps with no trustworthy match abstain and are marked as needing a fix.
- MCP server for coding agents: `getPage`, `authorTest`, `runTest`, `listRepairs`, `getRepairContext`, `submitRepair` and more.
- `gimbal init`, `gimbal doctor`, `gimbal test` with list, JSON and JUnit reporters and exit codes for CI.
- No generative model is called at run time; a local embedding model, pinned to an exact revision, scores matches.
