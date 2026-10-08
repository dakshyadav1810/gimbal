# MCP tools

`npx gimbal mcp` exposes these tools over stdio. The server also sends short instructions describing the workflow, which most clients show to the model.

| Tool | Purpose |
|---|---|
| `getPage` | What a page looked like when Gimbal last saw it: element roles, accessible names, regions, test ids, disabled state, and whether the browser was logged in. Never contains typed values or URL query strings. Remembered snapshots are returned with their age; `refresh: true` (or a page never seen) opens the page now. |
| `exploreUiState` | Opens a URL, optionally performs one action, and returns what appeared or disappeared. Nothing is saved as a test. |
| `authorTest` | Validates, stores and grounds a test in one call. Accepts YAML DSL, a full Spec IR object, or an existing `testId` to re-ground. |
| `compileDsl` | Turns YAML DSL into Spec IR without storing it. |
| `decompileSpec` | Returns a stored test as YAML DSL. |
| `executeDsl` | Compiles, stores, grounds and runs a DSL test and returns the run report. |
| `runTest` | Runs a grounded test. Waits for the report by default (`sync: true`). Secret values go in `vars`. |
| `getReport` | Fetches the report for a past run. |
| `listRepairs` | Lists heal proposals, steps Gimbal declined to guess about (`needed`), and earlier decisions. Filter by `testId` or `status`. |
| `getRepairContext` | Read-only. The current spec and last grounded test for a test you are going to repair. |
| `submitRepair` | Sends your full patched spec and the ids of the steps you changed. Only those steps are re-resolved. |
| `deleteTest` | Deletes a test and its history. Cannot be undone. |

Accepting or rejecting a heal proposal is not an agent tool on purpose. That decision belongs to the developer, through `gimbal repair` or the dashboard.
