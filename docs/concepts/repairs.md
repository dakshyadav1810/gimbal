# Repairs

A repair is a reviewable record of something Gimbal changed or declined to change. Repairs live in `.gimbal/tests/<testId>/repairs.json`, next to the test they belong to, so they travel with your repository.

## Kinds and states

| Kind | Meaning |
|---|---|
| `heal` | A run found the step's element somewhere else and used it. Starts as `proposed`. |
| `needed` | The step was stale and Gimbal found nothing it trusts. It abstained. Status `needed`. |
| `patch` | A change submitted by an agent. |

Statuses: `proposed`, `needed`, `accepted`, `rejected`, `superseded` (a newer proposal replaced it).

Each record has the before and after location (label, role, region, selector), the evidence (confidence, the five signal scores, the runner-up), and how it was verified. Nothing in it contains page contents or typed values.

## What happens when

- A heal is written only after its action has been verified. A heal whose outcome check fails is not recorded and the step fails.
- A proposal that was verified, or that could not be checked, is reused on later runs, even if the local cache is deleted.
- **Accept** folds the new selector into `grounded.json` and clears the cache entry. Commit that file. The next run does not heal.
- **Reject** records the decision. The same selector will not be proposed again for that step; Gimbal abstains instead.
- An abstention becomes `needed`. An agent fixes it with `getRepairContext` and `submitRepair`, which re-resolves only the steps it lists.

## In CI

`gimbal test` exits 2 when nothing failed but repairs are waiting, and 1 with `--strict`. Set `healing.mode` to `strict` to fail steps whose heal could not be verified, or `off` to stop healing entirely.
