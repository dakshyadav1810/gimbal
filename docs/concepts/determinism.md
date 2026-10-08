# Determinism

Gimbal is deterministic about the part it controls: the same page and the same target give the same match, because scoring uses fixed weights and an embedding model pinned to an exact revision. It cannot make your app deterministic.

## What you can pin

| Config | Effect |
|---|---|
| `determinism.fixedTime` | Freezes the browser clock. |
| `determinism.harPath` + `harMode` | Records network traffic once and replays it, so the backend stops varying. |
| `determinism.storageStatePath` | Starts every run logged in, with a saved Playwright storage state. |
| `embeddingRevision` | The exact model commit. Changing it requires re-grounding. |

## What stays nondeterministic

Server-side data, animations that outlast the settle window, third-party scripts, random ids and anything time-dependent that is not behind the browser clock. Gimbal waits for the page to settle and for the target to be stable and un-occluded before acting, but it cannot wait out a backend that gives different answers.
