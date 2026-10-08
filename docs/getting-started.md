# Getting started

Gimbal needs Node 22 or newer and a web app you can run locally. It tests in Chromium.

## 1. Set up the project

```bash
npx gimbal@alpha init
```

This creates `.gimbal/` and `gimbal.config.json`, git-ignores the machine-local parts of `.gimbal/`, and installs the agent skill when your project has a `.claude/` folder (or you pass `--agent claude`). Running it again changes nothing.

## 2. Check the machine

```bash
npx gimbal@alpha doctor --url http://localhost:3000
```

```
Gimbal Doctor
✓ Node 22
✓ Gimbal server
✓ Chromium
✓ Embedding model (Xenova/all-MiniLM-L6-v2, rev 751bff37)
✓ Target application (http://localhost:3000)
Ready.
```

Each failure prints the command that fixes it. Chromium: `npx playwright install chromium`. The embedding model (about 25 MB) downloads once: `npx gimbal@alpha doctor --download`.

## 3. Connect your coding agent

For Claude Code:

```bash
claude mcp add gimbal -- npx gimbal@alpha mcp
```

For any other MCP client, add a stdio server that runs `npx gimbal@alpha mcp`.

## 4. Write the first test

Start your app, then ask your agent something like:

> Create a Gimbal test that logs in to http://localhost:3000/login with the test account and checks that we land on the dashboard.

The agent looks at the page (`getPage`), writes the test by meaning, grounds it against your running app and runs it. The test is saved under `.gimbal/tests/`. Commit that folder.

## 5. Run it

```bash
npx gimbal@alpha test
```

## 6. When the UI changes

Runs heal what they can and record it. See what happened:

```bash
npx gimbal@alpha repair list
npx gimbal@alpha repair show <id>
npx gimbal@alpha repair accept <id>      # or: repair reject <id>
```

Or open the dashboard with `npx gimbal@alpha start` and use the Repairs page. Commit the updated `grounded.json` after accepting.

## 7. In CI

```yaml
- run: npx gimbal@alpha start
- run: npx gimbal@alpha test --reporter junit --strict > gimbal.xml
```

Exit code 0 means pass, 1 means a failure (or, with `--strict`, an open repair), 2 means nothing failed but a repair is waiting. Start your app before the tests.
