# CLI reference

Run with `npx gimbal <command>`. Commands read `gimbal.config.json` from the current directory.

| Command | What it does |
|---|---|
| `init [--agent claude]` | Creates `.gimbal/`, `.gimbal/.gitignore` and `gimbal.config.json`. Never overwrites a file that exists, so it is safe to run again. Copies the agent skill into `.claude/skills/gimbal/` when `.claude/` exists or `--agent claude` is given. Prints how to connect your agent, then runs `doctor`. |
| `doctor [--url <app>] [--download]` | Checks Node 22+, Chromium, the embedding model, the Gimbal server and your app. Prints the fix for each failure and exits 1 if anything is wrong. `--download` fetches the embedding model if it is missing. |
| `start` | Starts the server in the background (if it is not already running) and opens the dashboard. |
| `mcp` | Starts the MCP server on stdio for a coding agent, starting the Gimbal server if needed. Does not open the dashboard. This is the command to register with your agent. |
| `stop` | Stops the background server. |
| `ground <testId>` | Grounds a test against the running app. |
| `test [testId] [--reporter list\|json\|junit] [--bail] [--strict]` | Runs one test or all of them. See exit codes below. |
| `repair list [--test <id>] [--status <s>]` | Lists repairs. By default only the ones still open. |
| `repair show <id>` | Prints one repair. `<id>` can be the first few characters. |
| `repair accept <id>` | Folds a heal proposal into the test's `grounded.json`. |
| `repair reject <id> [--reason <text>]` | Rejects a proposal. The same selector is not proposed again for that step. |
| `repair context <testId>` | Prints the repair context to hand to your agent. |
| `report <runId>` | Prints a stored run report. |
| `export <testId> [-f playwright]` | Writes a grounded test out as a Playwright script. A one-way convenience, not a supported format. |

## Exit codes for `gimbal test`

| Code | Meaning |
|---|---|
| 0 | Every test passed and nothing is waiting for review. |
| 1 | A step failed. |
| 2 | Nothing failed, but a person should look: a step was healed, a heal could not be verified, or a step was marked as needing a fix. |

`--strict` turns 2 into 1, for pipelines that should not pass with open repairs.

Reporters: `list` (default, one line per test plus the steps that need attention), `json`, and `junit`. JUnit has no "needs review" state, so those tests are reported as skipped.
