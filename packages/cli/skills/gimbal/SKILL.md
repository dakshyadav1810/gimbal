---
name: gimbal
description: Author, run and repair browser tests with Gimbal through its MCP server. Use when the user asks to test a flow, write an end-to-end test, fix a broken or stale test, review what Gimbal healed, or read a test run, in a repo that uses Gimbal.
---

# Gimbal

Gimbal runs browser tests stored as JSON and keeps them working when the UI changes. It has no model of
its own: you do the thinking, Gimbal does the deterministic work. Connect over MCP (`gimbal mcp`).

## Words used precisely

- **Grounding** turns your intent ("the Sign in button") into a real element on the live page.
- **Healing** is what a run does when a stored selector no longer matches: it looks for the same element
  again, checks the result, and carries on. It never calls a model.
- **Repair** is a reviewable change, kept in `.gimbal/tests/<id>/repairs.json`: either a heal proposal
  (a different element was used) or a step marked **needed** because Gimbal **abstained**: nothing
  trustworthy was found.
- A developer accepts or rejects heal proposals. You fix `needed` steps.

## Workflow

```
getPage(url)        see the real controls first (roles, names, regions)
authorTest / executeDsl   describe the test by meaning; Gimbal validates, stores, grounds it
runTest             run it; read the report
listRepairs         anything healed or abstained since?
getRepairContext -> submitRepair   fix steps that are `needed`
```

The app must be running before you ground or run. If `getPage` says it cannot open the page, tell the
user to start the app; do not guess.

## Authoring rules

- Every UI target is `{ label, semantics[], role, actions[], intent }`. `semantics` matters most: list the
  synonyms a user could see ("sign in", "log in"). `role` must be a real ARIA role.
- Never write a CSS selector, XPath or test id. Describe meaning; grounding finds the element.
- Clicks and submits that change the page need an `expectedOutcome` or an assertion on that step or the
  next one. It is what catches a wrong heal. Lint warns when it is missing.
- Assert something real: URL change, text that appears, a saved row. Not "nothing threw".
- Secrets go in `flow.vars` as `${name}` and arrive through `runTest`'s `vars`. Never put a credential
  in a spec.
- Expected rejections (bad password) are `negative: true` steps.
- One flow per spec.

## Reading grounding results

`ungrounded` steps stop grounding there; later steps depend on that state. Fix the target, do not resubmit
the same spec: grounding is deterministic.

| Symptom | Likely cause | Do this |
|---|---|---|
| all candidates low | icon-only or unlabeled control | widen `semantics`, or ask for a `data-testid` |
| near-tie candidates | repeated controls | add a disambiguator (nearby text, index) |
| no candidates | wrong step order or hidden state | reorder or add a precondition |
| candidates all wrong | role or meaning is off | correct the target |

## Reading runs

- `passed` / `failed`: a failed assertion is a real bug. Report it. Healing only locates elements; it
  never excuses wrong behaviour.
- `warning`: a heal could not be verified (nothing to check it against). Add an outcome to that step.
- `stale`: Gimbal abstained. A `needed` repair now exists.
- `selection: "resolver"` means the step healed during the run. If the same step keeps healing, its
  target is too loose.

## Repairing

1. `listRepairs({status: "needed"})` to find steps.
2. `getRepairContext(testId)`: current spec plus last grounded test. Read-only.
3. Diagnose: element removed, state no longer reached, meaning changed, or two candidates tie.
4. Re-author only those targets, DOM-blind. `submitRepair(testId, stepIds, fullPatchedSpec)`.
   Only the listed steps are re-resolved.

Heal proposals (`status: "proposed"`) are the developer's call: `gimbal repair accept|reject`, or the
dashboard. Tell them what changed and why; do not accept for them.

## Never

- Invent a selector or put a secret in a spec.
- Treat an assertion failure as something to heal.
- Call `submitRepair` without reading `getRepairContext` first.
- Call `deleteTest` without a clear go-ahead. It cannot be undone.
