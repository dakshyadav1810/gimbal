# How Gimbal works

Four words are used the same way everywhere:

- **Grounding** turns an intent ("the Sign in button") into a real element on the live page.
- **Healing** is what a run does when a stored selector no longer matches: it looks for the same element again, checks the result, and carries on.
- **Repair** is a change you can review, kept in `repairs.json` next to the test. It is either a heal proposal or a step Gimbal declined to guess about.
- **Abstain** is that second case: nothing trustworthy was found, so the step is marked as needing a fix instead of acting on a guess.

## The loop

1. Your coding agent describes a test by meaning (role, accessible name, intent), never by selector. This is the **Spec IR**, stored as JSON.
2. **Grounding** opens your app in Chromium, collects the elements on the page, scores them against each target, and stores the winner with a durable selector in `grounded.json`.
3. **Runs** use the stored selector first. If it still matches exactly one visible element, that is the whole cost.
4. If it does not, the run **heals**: it re-resolves just that step against the live page.
5. A heal is **verified** after acting, then recorded as a **repair** (a proposal) and left for a person to accept or reject. A step with no trustworthy match **abstains**.

No generative model is called at any point at run time. Gimbal makes no calls to a model service. The one learned component is a small embedding model, run locally, whose weights are pinned to an exact revision, so the same inputs give the same scores.

## How a match is scored

Each candidate element on the page is scored against the target:

| Signal | Used for |
|---|---|
| Affordance | A filter: a text box cannot satisfy a `click`, a button cannot satisfy a `type`. |
| Semantics (weight 0.45) | Similarity of the accessible name and synonyms to the target, using the local embedding model plus exact and lexical matches. |
| Context (0.33) | Where the element sits: form, modal, section, nearby text and landmarks. |
| Structure (0.22) | Position among siblings and ancestors. |
| Index | A tie-breaker among otherwise equal candidates. |

The weights shift with the page (more weight on structure for icon-heavy pages, on context inside forms and modals, on structure for repeated rows). Scores become a **band**: `high` at 0.70 or more, `medium` at 0.50 or more, `low` below. A winner must lead the runner-up by a margin or win a deterministic tie-break; otherwise the band is lowered rather than guessing.

## Healing is stricter than grounding

At run time Gimbal acts on a live app with only this decision to go on, so a heal is refused when:

- the best candidate does not lead the runner-up by at least 0.05, unless its label match is clearly better;
- the candidate is outside the modal the original target was in;
- a reviewer already rejected that selector for that step.

## Verification

After a healed action runs, Gimbal checks it, using the strongest evidence available:

1. **Outcome**: the step's own `expectedOutcome` and assertions. If they fail, the step fails and the heal is not recorded.
2. **Effect**: what acting did at grounding time (did the URL path change, which elements appeared or disappeared). A heal that does something different fails.
3. **None**: nothing to compare against. The heal is recorded as unverified and the step passes with a warning (or fails in `strict` mode).

Verification happens after the action, so a wrong click has already happened. Give every click and submit an outcome. `gimbal` warns when you do not.

## What it will not do

- Fix a failing assertion. Healing finds elements; it never changes what a test expects.
- Heal steps in states nobody grounded.
- Drive browsers other than Chromium.
