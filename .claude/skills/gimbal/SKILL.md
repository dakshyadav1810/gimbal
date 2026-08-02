---
name: gimbal
description: Author, ground, run, and heal Gimbal tests through its MCP server. Use whenever the user asks to test a flow, write an end-to-end test, fix a broken/stale/flaky test, or check a test's results in a repo that runs Gimbal. Covers the full submitSpec to groundTest to runTest to healing workflow, DOM-blind authoring rules, and how to read confidence bands and run reports.
---

# Gimbal

Gimbal is a deterministic-first testing platform. You are the only source of intelligence in it, Gimbal
has no LLM of its own. You author tests by describing intent; Gimbal resolves that intent against the
real DOM, executes deterministically, and only asks you back in when deterministic resolution genuinely
can't continue. Everything below assumes you are connected over MCP (tools: `getMap`, `getDelta`,
`submitSpec`, `groundTest`, `runTest`, `getReport`, `pollRun`, `healing`, `updateTest`, `deleteTest`).

## The mental model

Three layers, each with a different owner:

1. **Intent (yours).** A test is a sequence of steps described by meaning: what the user is trying to do,
   what element they interact with (by role and label, not selector), what should be observably true
   afterward. You write this. It is DOM-blind on purpose.
2. **Grounding (deterministic, one-time per change).** Gimbal launches the real app and matches your
   intent against the live DOM using five signals (semantics, affordance, context, structure, index). No
   LLM involved. A confident match gets a durable selector cached for fast re-runs.
3. **Execution (deterministic, every run).** Cached selector first. If that selector stops matching
   uniquely, Gimbal re-derives it live (a "runtime heal"), still no LLM. Only if even that fails does a
   step become `stale` and come back to you.

You never write a CSS selector, XPath, or `data-testid` value yourself. If you find yourself doing that,
stop: that is grounding's job, and a selector you invented will be discarded anyway.

## The workflow, start to finish

```
getMap(route)              read app structure before writing the spec (optional but recommended)
   |
submitSpec(spec)           author the test as intent; Gimbal validates + stores it
   |
groundTest(testId)         Gimbal resolves intent against the live DOM; app must already be running
   |
runTest(testId)            execute; poll with getReport/pollRun(runId)
   |
   |- passed / failed  ->  done, or a real bug to report
   \- stale            ->  healing(testId)  ->  re-author just the broken part  ->  updateTest(...)
                              -> auto re-grounds -> developer reviews the diff
```

Don't skip grounding after authoring or editing a spec: an ungrounded test has no selectors yet and can't
run. Don't call `updateTest` speculatively either; only stale tests need it, and it requires the full
patched spec, not a diff.

## Authoring rules (what makes a good spec)

- **Every UI target is `{ label, semantics[], role, actions[], intent }`.** `semantics` is the highest
  leverage field: list every plausible visible synonym a real user might see (`["sign in", "log in",
  "authenticate"]`), not just the one string you expect. `role` should be the ARIA/implicit role
  (`button`, `textbox`, `link`, `checkbox`); get this right, it gates candidate matching hard.
- **Actuating steps need a target; wait/navigate steps must not have one.** (`click`, `type`, `select`,
  `keypress`, `submit` are actuating.)
- **Every spec needs at least one assertion or `expectedOutcome`, somewhere.** A spec with no observable
  check is a coverage illusion. Gimbal's lint rejects it, and you should never want to write one anyway.
- **Assert something real.** Prefer asserting the actual signal of success: URL change, text appearing,
  an API status, a DB row, not just "the click didn't throw."
- **Vars, never secrets.** Declare variable names in `flow.vars` (with non-secret defaults if any).
  Reference them as `${varName}` in steps. Actual secret values (passwords, tokens) are supplied later,
  at `runTest` time, via its `vars` argument. Never write a real credential into a spec.
- **Negative tests are first-class.** If the intent is "the app should reject this," set `negative: true`
  on the step instead of contorting the assertion; the runtime inverts the verdict for you.
- **Use `getMap` before authoring against an unfamiliar or large route.** It gives you real route names,
  form structure, and conditional render branches without reading the whole frontend. Every conditional
  branch it returns is one of three honest states: `resolved` (read the expression, it's complete),
  `needs_trace` (a pointer telling you exactly which file/line to check next), or `unknown` (runtime-only,
  e.g. a feature flag from a network call; no amount of static reading will resolve it, don't guess).
  Treat the KDG as a hint: if the live DOM disagrees with it at grounding time, the DOM wins.
- **One user-facing flow, one spec.** Don't cram unrelated flows into one spec because they happen to
  share a starting page. Split them so a failure is diagnosable at a glance.

## Reading grounding results

After `groundTest`, check for `ungrounded` steps before assuming the test is ready. Grounding stops
advancing at the first one, since later steps depend on page state that step would have produced. Common
causes and what to actually do about them:

| Symptom | Likely cause | Fix |
|---|---|---|
| All candidates low-band | icon-only control, no text signal | broaden `semantics[]`, or ask the developer for a `data-testid` |
| Two or more near-tie candidates | ambiguous repeats (e.g. row of identical buttons) | add a disambiguator: index, or nearby text in the spec |
| Zero candidates | element genuinely not on page yet | fix step order, or add a `precondition` (`visible`, `enabled`, `modal_open`, `url_contains`) |
| Candidates present but all wrong | authored role/semantics don't match reality | correct the Tier-1 target, don't just retry |

Don't resubmit the identical spec hoping grounding succeeds on a retry. Grounding is deterministic, same
input produces the same result. Fix the actual target.

## Reading run results

`getReport`/`pollRun` gives you per-step status. What each one means for you:

- **passed / failed.** Normal outcomes. A `failed` step with a real assertion mismatch is a genuine bug;
  report it as one, don't try to "heal" it. Healing only ever concerns *locating* an element, never
  whether the app behaved correctly.
- **warning / skipped.** Non-fatal; check `onFailure` on that step (`continue`, `retry_once`, `optional`)
  to understand why execution didn't stop.
- **stale.** The deterministic resolver could not confidently re-locate the element even after a live
  re-ground attempt. This is not a transient failure to retry. Go to the healing flow below.

The `selection` field on a passed step tells you how it resolved: `cached` (fast path, nothing changed),
`resolver` (it healed silently mid-run; worth noting if the same step heals repeatedly, since that
signals its target is too loosely specified), or `none`.

## Healing a stale test

1. Call `healing(testId)`, read-only, returns the current spec, last grounded test case, and KDG context.
   It does not attempt any repair itself.
2. Diagnose using the payload: was the element removed, is it in a state the test never reaches anymore,
   did its role/semantics genuinely change, or is it now ambiguous against a sibling? (Routine attribute
   or class churn is already absorbed by the runtime heal automatically; if a step is stale, the cause is
   bigger than that.)
3. Re-author *only* the affected Tier-1 target(s), stay DOM-blind, same rules as authoring a fresh spec.
   Don't regenerate steps that weren't broken.
4. Call `updateTest(testId, stepIds, spec)` with the full patched spec and the list of step IDs you
   touched. This automatically re-grounds the affected steps and produces a diff for the developer to
   review; it is never auto-committed.

## Hard boundaries (don't do these)

- Never author or paste a CSS selector, XPath, or DOM attribute into a spec. Tier-1 targets are meaning
  only.
- Never treat an assertion failure as something to heal. A found-but-wrong-behavior result is a bug
  report, not a resolver problem.
- Never put a real secret (password, API key, token, PII) into a spec; use `${var}` plus `runTest`'s
  `vars`.
- Never call `updateTest` without first reading `healing` for context. A repair authored blind tends to
  either overwrite unrelated steps or miss the actual cause.
- Never assume `runTest` blocks until done; poll `getReport`/`pollRun`.
- Never call `deleteTest` without the developer's clear go-ahead. It's permanent, no undo.
