# REST API

The dashboard and the CLI talk to the local server over REST and WebSocket; nothing else is supported. The server listens on `127.0.0.1` only and rejects requests whose `Host` is not local, and state-changing requests with a foreign `Origin`.

All routes are under `/api` except `GET /health`.

| Route | Purpose |
|---|---|
| `GET /health` | Liveness. |
| `GET /api/doctor`, `POST /api/doctor/warm-model` | Environment checks and model download. |
| `POST /api/tests` | Validate and store a Spec IR. |
| `GET /api/tests` | List tests with last run outcome and open repair count. |
| `GET /api/tests/:id`, `PATCH /api/tests/:id`, `DELETE /api/tests/:id` | Read (grounded if available), replace the spec, delete. |
| `POST /api/tests/:id/ground` | Ground against the running app. |
| `GET /api/tests/:id/repair-context` | Spec and grounded test, for a repair. |
| `POST /api/tests/:id/repair` | Submit a patched spec (`{stepIds, spec}`). |
| `GET /api/tests/:id/repairs`, `GET /api/repairs?status=&testId=` | List repairs. |
| `POST /api/repairs/:id/accept`, `POST /api/repairs/:id/reject` | Decide a proposal. |
| `GET /api/tests/:id/runs`, `POST /api/runs`, `GET /api/runs/:id` | Run history, start a run, read a report. |
| `GET /api/tests/:id/candidates`, `GET /api/tests/:id/aria-snapshot` | Grounding evidence. |
| `GET /api/snapshots?url=`, `POST /api/snapshots/refresh` | Page snapshots (what `getPage` serves). |
| `POST /api/author/explore` | Exploratory action and DOM diff. |
| `GET /ws/runs/:id`, `GET /ws/ground/:id` | Live progress. |

Errors are `{ "error": { "code", "message" } }`. Messages for validation, ungrounded and stale cases end with what to change.
