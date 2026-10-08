# Configuration

`gimbal.config.json` in the project root. Every key is optional.

| Key | Default | Meaning |
|---|---|---|
| `port` | `4319` | Port of the local Gimbal server (127.0.0.1 only). |
| `browser` | `chromium` | Chromium is the supported browser. |
| `headless` | `true` | Run the browser without a window. |
| `appUrl` | unset | Address of your app. Used by `gimbal doctor`. |
| `healing.mode` | `propose` | `propose`: heal during a run, verify, record a repair for review. `strict`: a heal that cannot be verified fails the step. `off`: never heal; a missing selector marks the step as needing a fix. |
| `snapshots` | `ground` | `ground`: remember pages seen while grounding. `always`: also after runs. `off`: store nothing. |
| `bands.high` / `bands.medium` | `0.7` / `0.5` | Confidence thresholds. A match at or above `high` is used; at or above `medium` is used with lower trust; below is rejected. `high` must be greater than `medium`. |
| `embeddingModel` | `Xenova/all-MiniLM-L6-v2` | The local sentence-embedding model used for the semantic signal. |
| `embeddingRevision` | pinned commit | Exact model revision. Tests grounded with a different model or revision are refused at run time until re-grounded. |
| `timeouts.actionMs` | `15000` | How long to wait for an element before giving up on a step. |
| `timeouts.navMs` | `30000` | Navigation timeout. |
| `maxScrollPasses` | `3` | Extra scroll-and-look passes when a list looks virtualized. `0` disables. |
| `db.url` / `db.readOnly` | unset / `true` | Optional Postgres connection for database steps. Needs the `pg` package installed. |
| `determinism.fixedTime` | unset | Freeze the browser clock at this time. |
| `determinism.harPath` / `harMode` | unset | Record or replay network traffic from a HAR file. |
| `determinism.storageStatePath` | unset | A saved login (Playwright storage state) to start every run with. Page snapshots are marked `authenticated` when this is set. |
| `dbPath`, `artifactsDir`, `screenshotsDir`, `fixturesDir`, `snapshotsDir` | under `.gimbal/` | Where things are stored. |

Environment: `GIMBAL_PORT` overrides `port`. Set `HF_HUB_OFFLINE=1` once the model is downloaded to stop any network lookups.
