# SPEC-006: KDG — Knowledge Dependency Graph (Next.js, v1)

**Status:** Draft
**Implements:** [ADR-004](../adr/ADR-004.md), [ADR-002 §6](../adr/ADR-002.md)
**LLD:** [LLD-011](../lld/LLD-011-kdg.md)

> The KDG gives a connected coding agent a cheap, deterministic map of a Next.js app's UI structure —
> parent/child containment and conditional-render branches — so authoring and repair don't require
> re-reading the whole frontend every time. It is authoring/repair-time context only. It never
> participates in grounding, resolution, or execution, and it never calls a model to build itself.

---

## 1. Problem

An agent authoring or repairing a Gimbal test either already has the frontend source (per the project's
current model) or doesn't. When it does, and the app is small, reading the relevant files directly is
free and sufficient — no KDG is needed. The problem only appears once the app is **large enough that
re-reading it on every authoring/healing pass is unreliable or exceeds context** — at that point the
agent needs a way to look up "where does this element live, and under what condition does it appear"
without re-deriving that from scratch each time.

A knowledge graph only earns its construction cost if querying it is cheaper than the agent re-deriving
the same facts from source. This SPEC exists to make that trade real, not aspirational: **KDG construction
must stay out of the agent's authoring loop (fast reruns, no LLM), and reads must stay small (route-scoped,
not whole-app).**

## 2. Scope for v1

| Item | This SPEC |
|---|---|
| Framework | **Next.js App Router only.** Pages Router, generic React, other frameworks are out of scope. |
| Parent/child structure | **In scope** — JSX containment for the route's transitive component tree |
| Conditional branches | **In scope** — every ternary / `&&` / `.map()` / early-return / switch branch, captured with a three-way resolution (§4) |
| Construction method | **Deterministic static analysis only** — TypeScript Compiler API. No LLM call anywhere in construction. |
| Consumers | `getMap` / `getDelta` MCP tools (authoring-time context); the maintenance-heal repair payload (unchanged shape from ADR-002 — `kdg` field stops being `z.unknown()`, see LLD-011 §5) |
| Runtime use | **None.** The KDG is never read by grounding, the resolver, or execution. |

## 3. What the KDG is not

- **Not a live DOM snapshot.** Grounding already extracts real DOM candidates once, deterministically, at
  grounding time (LLD-003) — that's ground truth for what's actually rendered. The KDG is a static,
  pre-computed hint about structure and conditions, consulted *before* that, not a replacement for it.
- **Not a taxonomy of *why* something is conditional.** There is no `kind: "role" | "featureFlag" | ...`
  classification. The KDG stores the raw condition expression and, where it can't safely resolve further,
  a pointer to exactly where to look — the consuming agent interprets the expression itself (ADR-004
  Context).
- **Not authoritative.** A `resolved` conditional is still just what static analysis found in source; the
  live DOM at grounding time is what actually decides whether a step is groundable. The KDG informs
  authoring; it never overrides grounding.

## 4. Conditional resolution — three outcomes, not two

Every conditional JSX branch the static pass finds resolves to exactly one of:

```
found a conditional branch
        │
        ▼
  is the condition inline, or resolvable through one safe traced hop
  (a prop, a simple in-repo hook/context whose definition is found)?
        │
   ┌────┴────┐
  yes         no — but the identifier's definition IS locatable in source
   │           │
   ▼           ▼
resolved   needs_trace           runtime-only data (network flag, middleware) —
(raw        (raw expr +           no file anywhere resolves it
expression)  file/line/           │
             one-line hint)       ▼
                                unknown
                                (raw expr, reason)
```

- **`resolved`** — e.g. `user.isAdmin && <AdminNav/>` where `isAdmin` is a direct prop. Raw expression
  text is stored verbatim; the agent reads it like it would reading the file.
- **`needs_trace`** — e.g. `const canEdit = useCanEdit(); canEdit && <EditButton/>` where `useCanEdit`'s
  logic isn't safely inline-resolvable. The KDG stores the raw expression **and** a pointer: file path,
  line, and one short instruction (e.g. "check what `useCanEdit` returns and under what condition"). This
  is not "unknown" — it is "here is exactly the one place to look," which is strictly more useful to an
  agent than an opaque miss and strictly safer than Gimbal guessing what the hook does.
- **`unknown`** — e.g. a feature flag resolved via a network call at runtime. No file in the repo contains
  the answer; static analysis (or an agent reading the same source) cannot resolve this without executing
  code. Stored honestly as unknown, with the raw expression preserved, consistent with this project's
  "never fabricate, mark stale/unknown for review" posture (ADR-001, ADR-002, SPEC-004 §3).

No case above ever produces a guessed value. `needs_trace` and `unknown` differ only in whether a
follow-up read has a chance of resolving the answer.

## 5. Construction and freshness

- **Trigger:** `getMap` (and `getDelta`), called by the agent — not a background watcher, not a separate
  build command, for v1 (ADR-004 Decision 4).
- **Staleness check:** a per-file content-hash manifest is diffed against tracked source on every call.
  Nothing changed → served from cache, no re-parse. Something changed → only those files are re-parsed and
  patched into the graph (per-file node replacement, ADR-004 Decision 6) — cost is proportional to files
  changed, never to app size.
- **Tracked source:** discovered by Next.js App Router convention — `app/**/page.tsx`, `layout.tsx`,
  `route.ts`, plus each entry file's transitive local imports, stopping at `node_modules`. No config
  needed for v1 (ADR-004 Decision 2/D).
- **This is what makes reruns cheap.** The expensive part (parsing, tracing) happens once per changed
  file, not once per authoring/healing call.

## 6. What `getMap` actually returns

`entryUrl` resolves to its `page.tsx`; the response is **that route's transitive component subgraph
only** — not the whole app. A shared component (e.g. a global nav on every route) appears once, by
reference, not duplicated per route. This is the read-side half of "cheap" — see LLD-011 §4 for the exact
shape.

`getDelta` reports which nodes were added/removed/changed since a prior version — for an agent that
already fetched a map and wants to know if anything relevant moved, without re-fetching the whole
subgraph.

## 7. Definition of done (v1)

- A Next.js App Router project's route can be pointed at with `getMap({ entryUrl })` and return a
  correct parent/child subgraph for that route, with every conditional branch resolved to `resolved`,
  `needs_trace`, or `unknown` — never a fourth, guessed state.
- Editing one component file and re-calling `getMap` reflects the change without a full-app re-parse.
- Construction makes zero model calls, at any point, for any file.
- The maintenance-heal repair payload's `kdg` field is populated with real route-scoped structure instead
  of `z.unknown()`.

## 8. Explicitly deferred

- Non-Next.js frameworks; Next.js Pages Router.
- Dynamic/multi-state crawling as a supplementary signal for `needs_trace`/`unknown` conditions.
- A background file-watcher keeping the graph always-warm between `getMap` calls.
- Any cross-route widening parameter on `getMap`.
- Any use of the KDG by grounding, the resolver, or execution — this stays authoring/repair-time only.
