# LLD-010: Dashboard — Views, Data Flow, Screenshot Capture

**Status:** Draft
**Implements:** [ADR-002 §6](../adr/ADR-002.md), [ADR-003 Decision 5](../adr/ADR-003.md) ("dashboard bundled inside the core server")
**Supersedes (partially):** the "thin this pass" scope note in [SPEC-005 §3](../specs/SPEC-005-mcp-cli-dashboard.md#3-dashboard-thin-this-pass)
**See also:** [LLD-000](./LLD-000-architecture.md), [LLD-005](./LLD-005-execution.md) (screenshot capture lands here), [LLD-007](./LLD-007-storage.md) (existing cache tables this reads), [LLD-008](./LLD-008-mcp-server.md)

> The dashboard is core UX for shipping — the visual surface a developer actually uses to see whether
> their tests work and fix the ones that don't. This LLD scopes it to what's needed now: test list, run
> history, a live run view with screenshots, and a review queue for stale steps. **KDG-dependent views
> (selector map), coverage, and suggested tests remain deferred** — out of scope here, unchanged from
> SPEC-005 §3.

---

## 1. Scope for this pass

| SPEC-005 §3 item | This LLD |
|---|---|
| Results: run history, pass/fail/stale, selection source, timings | **In scope** — new `/tests/:id/runs` route + view |
| Screenshots of key test moments | **In scope** — new capture code in the UI execution adapter ([LLD-005](./LLD-005-execution.md)) + dashboard rendering |
| Review queue: stale steps → trigger maintenance heal | **In scope** — new `/reviews` route(s) + view, "copy repair payload for agent" action |
| JSON test editor | **Already built** (`JsonEditor.tsx`) — kept, restyled |
| Selector map (KDG-dependent) | **Deferred** — KDG itself is deferred (see conversation; ADR-002 explicitly out-of-scopes the KDG data structure) |
| Coverage (covered/total) | **Deferred** — methodology still unresearched per ADR-002 |
| Suggested tests | **Deferred** — needs KDG |

Invariant #3 (dashboard never executes tests) is unchanged: every action below is a REST/WS call into
core. No Playwright, no test logic, ever runs in the dashboard process.

---

## 2. New/changed core surface (small, additive — no new subsystem)

The underlying data mostly already exists in the SQLite cache ([LLD-007](./LLD-007-storage.md),
`CacheStore` in `packages/core/src/cache/index.ts`); it just isn't exposed over REST yet. This LLD adds
routes, not business logic.

**All REST routes below live under `/api`** (`GET /api/tests`, not `GET /tests`) — discovered necessary
during implementation, not part of the original design: the dashboard's own client-side route map (§3.2)
reuses these exact bare paths (`/tests`, `/tests/:id`, `/tests/:id/runs`, `/reviews`) for its pages, so
without a prefix the REST routes and the SPA routes collide and the REST handler always wins (it's a
real registered Fastify route; the SPA fallback only fires for genuinely unmatched paths). See
DECISIONS.md #12. `/health` and the `/ws/*` WebSocket routes are unaffected — no dashboard page uses
those paths.

### 2.1 Run history

```
GET /api/tests/:id/runs   → RunSummary[]   (newest first)
```

`RunSummary` (new `shared` DTO): `{ runId, status, needsReview, startedAt, finishedAt }` — a thin
projection of `RunReport` without the `steps[]` body, so the list view stays cheap. Backed by a new
`CacheStore.listRuns(testId): RunSummary[]` reading the existing `runs` table (`packages/core/src/cache/schema.ts`),
ordered by `startedAt desc`. Full detail for one run still comes from the existing `GET /api/runs/:id`.

### 2.2 Review queue

```
GET /api/reviews          → ReviewRecord[]   (all open reviews, across tests)
GET /api/tests/:id/reviews → ReviewRecord[]  (scoped to one test)
```

Both call the **already-implemented** `CacheStore.openReviews(testId?)` — this is pure routing, zero new
storage logic. `ReviewRecord` (already typed in `cache/index.ts`) gets a Zod twin added to `shared` (see
§4) so the dashboard and the REST layer share one API-facing type instead of the dashboard hand-declaring
its own copy.

### 2.3 Repair payload (existing, unchanged)

`GET /api/tests/:id/repair` already exists and already returns `RepairPayload { specIR, testCase, kdg }`
(`kdg` stays `z.unknown()` — this LLD does not touch KDG). The dashboard's review-queue action reuses
this route as-is.

### 2.4 Screenshot capture (execution-layer addition, consumed here)

No code today calls `page.screenshot()` anywhere in `packages/core/src/execution/adapters/ui.ts` — the
`StepResult.screenshot` / `step_results.screenshot_path` fields are schema slots nobody populates
(confirmed by inspection, matches WALKTHROUGH.md §10's disclosure). This pass adds capture:

- After each UI step's `act` + `assert` phase, capture `page.screenshot({ type: "jpeg", quality: 70 })`
  (jpeg — screenshots are for human review, not pixel-diffing; no need for lossless PNG here).
- Write to `.gimbal/screenshots/<runId>/<stepId>.jpg` via the existing `FsArtifactStore`-style pattern
  (regenerable, like the SQLite cache — **not** committed to git; add to `.gitignore` alongside `.gimbal/cache.db`).
- Store the relative path in `StepResult.screenshot` (already-typed field) → persisted via the existing
  `CacheStore.saveRun` → `step_results.screenshot_path` (already-typed column). No schema changes needed
  anywhere — this is purely filling in an existing contract.
- New static route: `GET /screenshots/*` (Fastify `@fastify/static`, same pattern as serving the
  dashboard's own bundle) serves the `.gimbal/screenshots/` directory.
- Failure handling: a screenshot capture failure must never fail the step itself — wrap in try/catch,
  log via `pino`, leave `screenshot` undefined for that step. Observability, not correctness.

---

## 3. Dashboard architecture

### 3.1 Stack additions

| Concern | Choice | Why |
|---|---|---|
| Routing | **`wouter`** (or `react-router`, pick smallest that fits) | Deep-linkable URLs — `/tests/:id`, `/tests/:id/runs/:runId`, `/reviews` — matches the "trace viewer / API inspector" feel AGENTS.md asks for; a developer can paste a run link to a teammate. |
| Data fetching | **TanStack Query** (already a declared dependency, currently unused — this pass wires it up) | Named in PLAN-001; refetch-on-invalidate cleanly models "a WS event landed, re-fetch the run list" without hand-rolled cache bugs across now-multiple views. |
| Styling | **Tailwind** | Already the stated stack choice (AGENTS.md, PLAN-001). One-time Vite plugin + config cost, paid once across the new views instead of retrofitted later. |

New dependencies: `wouter` (or `react-router-dom`), `tailwindcss` + `@tailwindcss/vite`.
`@tanstack/react-query` is already installed but unused — no install step needed, just wiring. CodeMirror
(already present) stays for the JSON editor.

### 3.2 Route map

```
/                          → redirect to /tests
/tests                     → Test list (existing TestList, restyled)
/tests/:id                 → Test detail: JSON editor + "Run" button + latest-run summary
/tests/:id/runs            → Run history list for this test
/tests/:id/runs/:runId     → Run detail: full step table + screenshots + live log if still running
/reviews                   → Review queue, all tests
/reviews/:testId/:stepId   → Review detail: screenshot + candidates + repair payload + "copy for agent"
```

These are the dashboard's **client-side** routes, resolved entirely by `wouter` in the browser — the
REST API these pages call lives at the corresponding `/api/...` path (§2), not at the same URL. Core's
`setNotFoundHandler` serves `index.html` for any unmatched `GET` outside `/api/*` and `/screenshots/*`,
so a hard refresh or a pasted link on any of the routes above still loads the SPA shell and lets
`wouter` take over client-side (see DECISIONS.md #11).

### 3.3 Component layout

```
dashboard/src/
├── main.tsx                  # router setup, QueryClientProvider
├── App.tsx                   # shell: nav (Tests / Reviews), <Switch> of routes
├── api.ts                    # fetch wrappers — extended with listRuns, listReviews, getRepairPayload
├── queries.ts                # NEW — TanStack Query hooks (useTests, useRuns, useRun, useReviews...)
├── pages/
│   ├── TestListPage.tsx      # was TestList.tsx; now a page, not an inline sidebar
│   ├── TestDetailPage.tsx    # JSON editor + run trigger, wraps existing JsonEditor
│   ├── RunHistoryPage.tsx    # NEW — table of RunSummary, links to RunDetailPage
│   ├── RunDetailPage.tsx     # supersedes RunView.tsx — adds screenshot thumbnails per step
│   ├── ReviewQueuePage.tsx   # NEW — list of ReviewRecord across tests (or scoped)
│   └── ReviewDetailPage.tsx  # NEW — screenshot, candidates table, repair payload, copy button
├── components/
│   ├── JsonEditor.tsx        # unchanged
│   ├── StepTable.tsx         # extracted from RunView — reused by RunDetailPage
│   ├── Screenshot.tsx        # NEW — <img> against /screenshots/*, with a "no screenshot" placeholder
│   └── Nav.tsx                # NEW — top-level Tests/Reviews nav
└── styles.css                 # NEW — Tailwind entry
```

`RunView.tsx`'s live-WebSocket-log behavior is preserved but moves into `RunDetailPage`: when the route's
`runId` matches an in-flight run, it opens `/ws/runs/:id` exactly as today; when it's a past run from
history, it just renders the stored `RunReport` with no WebSocket.

### 3.4 Review queue action (per earlier decision)

`ReviewDetailPage`:
1. Fetches `GET /api/tests/:id/repair` → `RepairPayload { specIR, testCase, kdg }`.
2. Renders the failing step's screenshot + its ranked `candidates` (already in `GroundedTarget.resolution`).
3. "Copy for agent" button serializes the `RepairPayload` to the clipboard (`navigator.clipboard.writeText`)
   with a short instruction wrapper, e.g.:
   ```
   This Gimbal test step is stale and needs repair. Fix the target/spec and call the `updateTest` MCP
   tool with testId=<id> and the corrected spec.

   <RepairPayload JSON>
   ```
4. **No auto-heal button** — this stays read-only, matching `gimbal heal`'s existing philosophy
   (SPEC-005 §1: "no LLM call — a spec can only be created by a connected agent"). The dashboard is the
   visual equivalent of `gimbal heal`, not a new authoring path.

---

## 4. Data model additions (`packages/shared`)

```ts
// dto.ts additions
export const RunSummary = RunReport.omit({ steps: true });
export type RunSummary = z.infer<typeof RunSummary>;

export const ReviewRecord = z.object({
  testId: z.string(),
  stepId: z.string(),
  url: z.string(),
  screenshotPath: z.string().optional(),
  candidatesJson: z.string().optional(),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;
```

`ReviewRecord`'s shape is not new — it mirrors the `ReviewRecord` interface that already lives in
`packages/core/src/cache/index.ts` (backing `openReviews`/`enqueueReview` today). This LLD adds the Zod
twin in `shared` **as the one REST/DTO-facing definition** and the core route handlers import/return the
`shared` type; the pre-existing `cache/index.ts` interface remains as `CacheStore`'s internal storage
contract. Both packages describe the same shape by construction, but only one (`shared`) is the
API-facing source of truth — no third redefinition anywhere else.

No changes to `StepResult`, `GroundedTest`, or `RepairPayload` — screenshot and candidate fields already
exist; this pass populates and exposes them, it doesn't redesign them.

---

## 5. Invariant mapping

| Invariant | Where enforced |
|---|---|
| Dashboard never executes tests (#3) | Every page is a `fetch`/WebSocket client of core; zero Playwright/execution imports in `packages/dashboard` |
| Communication only REST/WS (#7) | New routes (`/api/tests/:id/runs`, `/api/reviews`) are the only additions; no direct DB/file access from the dashboard |
| Core owns business logic (#6) | `listRuns`/`openReviews` logic lives in `CacheStore` (core); dashboard routes are thin projections |
| No runtime LLM (ADR-001) | Review queue is read-only; repair payload construction and any fix authoring stays in the connected agent |

---

## 6. Explicitly deferred (unchanged from SPEC-005 §3 / prior discussion)

- **Selector map** — blocked on the KDG data structure, itself deferred.
- **Coverage view** — methodology not yet defined.
- **Suggested tests** — needs KDG.
- **Benchmark visualization** — no benchmarking subsystem exists yet (separately deferred).
- **Config UI** — editing `gimbal.config.json` through the dashboard; not required for the core author→
  ground→run→review loop, can be a fast-follow.

---

## 7. Open questions for implementation (not blocking, but worth flagging before coding starts)

- Screenshot retention/cleanup: `.gimbal/screenshots/` will grow unbounded across runs. Out of scope to
  solve here, but worth a TODO — e.g. prune on `gimbal stop`/`gimbal init`, or cap by run count.
- `GET /api/reviews` (all tests) vs. `GET /api/tests/:id/reviews` (scoped): both are listed above since the
  review queue page shows all tests but a test detail page may want to badge "N stale steps" — confirm
  both are actually needed before implementing the all-tests variant, or derive it client-side from
  per-test calls if the test count stays small.
