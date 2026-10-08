# Evidence

What is measured here is one narrow thing: **when a page changes, does Gimbal find the same element again, and does it refuse when it should?** Nothing in this page measures authoring quality, how agents behave, or anything outside Chromium.

## Method

- **Apps.** Seven small fixture apps in `fixtures/apps/` (login, checkout, a table with repeated rows, an icon-only toolbar, a modal, a nav bar, a settings form), 22 target elements in all. The first three were used while tuning the resolver. The other four were not looked at until the final run and are reported separately.
- **Mutations.** Seven changes applied after the test is grounded, each to one target: class and id renamed, a wrapper inserted, siblings reordered, label replaced by a synonym, label translated to Spanish, an identical element added next to the target, and the element removed. Every mutation also strips the target's `id`, so the stored selector breaks and something has to find the element again.
- **Ground truth** is kept in the page's JavaScript, not in attributes the resolver could read: each fixture records which element received the click. A case is a **recovery** if the right element was clicked, a **wrong action** if any other element was, and an **abstention** if nothing was.
- **Systems, same browser and same mutated pages:** the *stored selector* captured when the test was grounded; a *role + name* locator, `getByRole(role, {name})`, which is what most teams write by hand; and *Gimbal*, run through the real server and CLI path.
- **Metrics.** Precision when acting = recoveries / (recoveries + wrong actions). Recovery rate = recoveries / cases where the element still exists. Abstention rate = cases where nothing was clicked. Intervals are 95% bootstrap over cases (2,000 resamples, fixed seed).
- Re-run it with `pnpm bench` (about 10 minutes). Raw per-case outcomes are in `packages/bench/results/bench-latest.json`.

## Results

### Tuning apps (63 cases, apps: login, checkout, table)

| system | precision when acting | false-positive rate | abstention rate | recovery rate |
|---|---|---|---|---|
| stored selector | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | 0% (0%–0%) |
| role + name | 100% (100%–100%) | 0% (0%–0%) | 57% (46%–68%) | 60% (46%–74%) |
| Gimbal | 100% (100%–100%) | 0% (0%–0%) | 56% (44%–68%) | 62% (49%–76%) |

### Held-out apps (91 cases, apps: toolbar, modal, nav, settings)

| system | precision when acting | false-positive rate | abstention rate | recovery rate |
|---|---|---|---|---|
| stored selector | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | 0% (0%–0%) |
| role + name | 98% (92%–100%) | 1% (0%–3%) | 55% (45%–66%) | 62% (49%–73%) |
| Gimbal | 100% (100%–100%) | 0% (0%–0%) | 55% (45%–65%) | 63% (51%–75%) |

Outcomes are per (target, mutation) case; intervals are 95% bootstrap over cases. Median Gimbal run time per case: 14.1s (p95 14.6s, includes browser start).

Gimbal with the numbers above had its resolver tuned against the first three apps only. The held-out table is the one to read.

### By mutation (all 154 cases)

| mutation | what is true | stored selector | role + name | Gimbal |
|---|---|---|---|---|
| class-rename | element still there | 0/22 recovered, 0 wrong | 22/22 recovered, 0 wrong | 22/22 recovered, 0 wrong |
| wrapper-insert | element still there | 0/22 recovered, 0 wrong | 22/22 recovered, 0 wrong | 22/22 recovered, 0 wrong |
| reorder | element still there | 0/22 recovered, 0 wrong | 22/22 recovered, 0 wrong | 22/22 recovered, 0 wrong |
| label-synonym | element still there | 0/22 recovered, 0 wrong | 0/22 recovered, 0 wrong | 3/22 recovered, 0 wrong |
| label-i18n | element still there | 0/22 recovered, 0 wrong | 1/22 recovered, 0 wrong | 0/22 recovered, 0 wrong |
| duplicate-added | two identical elements | 22/22 abstained, 0 wrong | 21/22 abstained, 1 wrong | 22/22 abstained, 0 wrong |
| removed | element removed | 22/22 abstained, 0 wrong | 22/22 abstained, 0 wrong | 22/22 abstained, 0 wrong |

## What this shows

- A selector captured at authoring time recovers nothing once its id is gone. That is the problem being solved.
- For structural changes (renamed classes, wrapper elements, reordered siblings) Gimbal and a plain role + name locator both recover every case.
- When the element is **removed**, or there are **two identical candidates**, both refuse to act. An earlier version of Gimbal did not: it clicked a different button in 9 of 22 removal cases, because a small embedding model rates "Sign in" close to "Create account". Fixing that (requiring a clear lead, label overlap with the target or its listed synonyms, and no identically named rival) is what the numbers above reflect.
- On label changes Gimbal helps only a little. A synonym it was **told about** in the target's `semantics` list is recovered; other synonyms are not, and neither are translations. Gimbal prefers abstaining to guessing there. It recovered 3 of 22 synonym cases and 0 of 22 translations.

## What this does not show

- **Gimbal is not shown to beat a hand-written role + name locator** on these fixtures. Its recovery (63% held out) and that locator's (62%) are the same within the intervals. What Gimbal adds is verification after a heal, a reviewable repair record, and a declared "needs a fix" state, none of which this table scores.
- Small, synthetic pages with one changed target at a time. Real redesigns change many things at once, and real pages have far more elements to confuse.
- The mutations and the apps were chosen by the person who wrote the resolver. The held-out split guards against tuning on the answers; it does not guard against the mutations being easier or harder than real changes.
- 154 cases is enough to see large differences and not small ones. The intervals are wide on several rows.
- The "median run time" is a whole run including starting a browser, not the extra cost of a heal.
- Chromium only. Single-page flows only (no multi-step journeys). Semantic output assertions are not part of this alpha.

## Verification

Separately, `pnpm demo:verify` runs the full story with no model anywhere: a login page whose button label, wrapper and class names all change; the run heals, the heal is verified against the step's own assertion, a repair is proposed, accepted from the CLI, and the next run passes without healing. It fails the build on any deviation.
