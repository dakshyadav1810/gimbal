# LLD-011: KDG — Static Construction, Storage, and MCP Surface (Next.js v1)

**Status:** Draft
**Implements:** [ADR-004](../adr/ADR-004.md), [SPEC-006](../specs/SPEC-006-kdg.md)
**Depends on:** [LLD-001](./LLD-001-shared-ir.md) (shared schema conventions), [LLD-007](./LLD-007-storage.md)
(cache tier this reuses), [LLD-008](./LLD-008-mcp-server.md) (`getMap`/`getDelta` contracts this fills in),
[LLD-006](./LLD-006-healing.md) (repair payload's `kdg` field, currently `z.unknown()`)

> Static-analysis-only graph construction, scoped to Next.js App Router. No new subsystem package —
> lives in `packages/core/src/kdg/`, replacing the current `EmptyKdgContextProvider` stub. No LLM call
> anywhere in this LLD.

---

## 1. Module shape

```
core/src/kdg/
├── index.ts              # KdgService — public interface, replaces kdg-context.ts's stub export
├── discover.ts            # App Router source-scope discovery (app/**/page.tsx, layout.tsx, route.ts + transitive imports)
├── parse.ts                # per-file JSX AST walk → nodes + conditional branches (ts.Program/TypeChecker)
├── trace.ts                 # identifier resolution for conditionals (resolved / needs_trace / unknown)
├── manifest.ts               # per-file content-hash tracking, staleness diff
├── graph.ts                    # in-memory graph assembly, per-file node replacement patching
└── store.ts                     # SQLite read/write (kdg_nodes, kdg_manifest tables)
```

`packages/core/src/authoring/kdg-context.ts`'s `KdgContext`/`KdgContextProvider` interface is replaced by
the `shared`-typed schema below; `EmptyKdgContextProvider` is deleted, not kept as a fallback — there is no
"no KDG available" mode for a Next.js project once this ships (§7).

## 2. Data model (`packages/shared/src/schema/kdg.ts`, new file)

```ts
import { z } from "zod";

export const KdgNodeId = z.string(); // stable hash of (route, structural anchor) — see §3.3

// Reuses the anchor vocabulary Candidate already defines (candidates.ts) — same field names, so a
// KDG node and a grounding-time DomCandidate can be correlated without a second identity scheme.
export const KdgAnchors = z.object({
  testId: z.string().optional(),
  attributes: z.record(z.string()).default({}),
  contextPath: z.array(z.string()).default([]),
}).partial().default({});

export const KdgConditional = z.object({
  rawExpression: z.string(), // always populated — the agent's fallback in every case
  resolution: z.discriminatedUnion("status", [
    z.object({ status: z.literal("resolved"), summary: z.string() }),
    z.object({
      status: z.literal("needs_trace"),
      identifier: z.string(),
      hint: z.object({
        filePath: z.string(),
        line: z.number().optional(),
        lookFor: z.string(), // one short instruction, not a paragraph
      }),
    }),
    z.object({ status: z.literal("unknown"), reason: z.string() }),
  ]),
});
export type KdgConditional = z.infer<typeof KdgConditional>;

export const KdgNode = z.object({
  id: KdgNodeId,
  role: z.string().optional(),
  label: z.string().optional(),
  tag: z.string(),
  filePath: z.string(),
  anchors: KdgAnchors,
  parentId: KdgNodeId.nullable(),
  childIds: z.array(KdgNodeId).default([]),
  conditional: KdgConditional.nullable(),
});
export type KdgNode = z.infer<typeof KdgNode>;

export const KdgRoute = z.object({
  path: z.string(),
  entryNodeIds: z.array(KdgNodeId),
});
export type KdgRoute = z.infer<typeof KdgRoute>;

// Response shape for getMap — route-scoped, NOT the whole app (ADR-004 Decision 5).
export const KdgContext = z.object({
  version: z.string(),
  builtAt: z.string(),
  route: z.string(),
  nodes: z.record(KdgNodeId, KdgNode),
});
export type KdgContext = z.infer<typeof KdgContext>;

export const KdgDelta = z.object({
  fromVersion: z.string(),
  toVersion: z.string(),
  added: z.array(KdgNodeId),
  removed: z.array(KdgNodeId),
  changed: z.array(KdgNodeId),
});
export type KdgDelta = z.infer<typeof KdgDelta>;
```

This supersedes `kdg-context.ts`'s `{ routes: [], conditionals: [] }` stub shape entirely — that shape
never had conditional or parent/child semantics; there's nothing to migrate.

## 3. Construction pipeline

### 3.1 Source discovery (`discover.ts`)

Walk the project root for `app/**/page.tsx`, `app/**/layout.tsx`, `app/**/route.ts` (Next.js App Router
convention — no config). For each entry file, follow local (non-`node_modules`) static imports
transitively via the TS Compiler API's module resolution, building the file set to parse. This is the
"tracked source" both the full build and the manifest diff (§3.4) operate over.

### 3.2 Per-file JSX + conditional extraction (`parse.ts`)

Using `ts.createProgram` + `ts.TypeChecker` (already a dependency — no new package):

- Walk each file's JSX tree. Every JSX element becomes a `KdgNode` candidate: `tag`, accessible
  `role`/`label` (same extraction heuristics as `dom-extractor.ts`'s `accessibleName`, reused where
  reasonable — this is static-source text, not live DOM, so results will differ but the heuristic shape
  is the same), and `contextPath` derived from JSX nesting rather than a live DOM walk.
- Every `ConditionalExpression` (ternary), `LogicalExpression` (`&&`/`||`) wrapping JSX, `.map()` call
  producing JSX, early `return null`/`return false`, and JSX-producing `SwitchStatement` branch is
  recorded as a conditional gate on the JSX subtree it wraps, with its raw source text captured verbatim
  (`node.getText()`).
- Server/client boundary: a file's leading `"use client"` directive is recorded but does not change
  extraction — both are parsed identically for structure/conditional purposes; the distinction is not
  consumed anywhere in this LLD's v1 scope.

### 3.3 Node identity (`graph.ts`)

`KdgNodeId` = `sha1(route + contextPath.join("/") + tag + (role ?? "") + (label ?? ""))`. Deliberately
**not** derived from a CSS selector or line number — both churn on incidental changes (a reordered
import, a reformatted file) and would make `getDelta` show near-total turnover on every trivial edit,
defeating its purpose. Hashing structural identity means the same conceptual element keeps its id across
small, non-structural source changes.

### 3.4 Identifier tracing (`trace.ts`)

For each conditional's gating expression:

1. If the expression is a literal comparison or a directly-destructured prop/local variable with no
   further indirection, resolve immediately → `resolved`, `summary` = the expression text
   human-readably reformatted (not re-interpreted — no semantic claim beyond "this is the condition").
2. If the gating identifier is a call to a hook (`useXyz(...)`) or a context value, use the TypeScript
   type checker to find its declaration (`ts.TypeChecker.getSymbolAtLocation` → declaration node). If the
   declaration is found and is itself simple (a direct return of a prop/comparison, one hop, no further
   indirection) → resolve fully → `resolved`. If found but not safely resolvable further (the
   hook/context body has real logic, is imported from outside the tracked source set, or is a HOC/render
   prop wrapping the JSX) → `needs_trace`, with `filePath`/`line` from the declaration's source location
   and a `lookFor` string templated from the identifier kind (e.g. `"check what `useCanEdit` returns and
   under what condition"` — one line, not a paragraph, per this project's own comment-writing convention).
3. If no declaration is found in the tracked source at all (external package, dynamically computed, or
   the type checker can't resolve it — e.g. spread props obscuring the source) → `needs_trace` is not
   applicable (there is no file to point at) → `unknown`, `reason` = a short machine-readable cause
   (`"external_import"`, `"dynamic_computation"`, `"unresolvable"`).

No case here ever fabricates a value for what a condition evaluates to — only its *location* or
*unresolvability* is asserted, matching ADR-004's "pointer, never a guess" principle.

### 3.5 Manifest + staleness (`manifest.ts`)

```ts
export interface KdgManifestEntry { filePath: string; contentHash: string; }
```

On each `getMap`/`getDelta` call: hash every currently-tracked file (`sha1` of file contents), diff
against the stored manifest. Files with a changed hash (or newly discovered/removed from the tracked set)
are the rebuild set. An unchanged manifest short-circuits straight to serving the stored graph — no
parsing at all.

### 3.6 Incremental patch (`graph.ts`)

For each file in the rebuild set: remove every `KdgNode` whose `filePath` matches, re-parse the file
fresh (§3.2–3.4), insert the new nodes, and re-link `parentId`/`childIds` on the boundary between changed
and unchanged nodes (a changed file's root node re-attaches to its unchanged parent from the previous
graph; an unchanged file importing a changed component re-resolves that one edge). Cost is `O(files
changed)`, never `O(total tracked files)` — this is the mechanism SPEC-006 §5 depends on for "reruns must
be cheap."

## 4. `getMap` / `getDelta` (MCP + REST)

Extends the existing contracts in LLD-008 §2/§3 — signatures unchanged, response shape now concrete:

```
GET /kdg?entry=<entryUrl>   → KdgContext   (route-scoped — see below)
GET /kdg/delta?since=<version> → KdgDelta
```

`entryUrl` resolves to its `page.tsx` (reverse of the App Router convention in §3.1: strip the dev
server origin, map the path to `app/<path>/page.tsx`). The response's `nodes` map contains **only** that
route's entry node(s) and their transitive descendants/ancestors within the same route's component
subtree — not other routes' nodes, even if they exist in the same on-disk graph. A component shared
across routes (e.g. a global nav) is included once, under whichever route requested it; it is not
deduplicated *across* separate `getMap` calls for different routes, since each call is independently
route-scoped and stateless from the caller's perspective.

`getDelta(sinceVersion)` diffs the full on-disk graph's node set between two versions and returns
add/remove/change — this is whole-graph, not route-scoped, since its purpose is "did anything change,"
which is cheap (id + hash comparison, no content) regardless of app size.

Both routes currently exist as stubs (`packages/core/src/server/routes.ts:130-135`) — `GET /kdg` calls
`c.kdg.build(entry ?? "")` against `EmptyKdgContextProvider`; `GET /kdg/delta` is hardcoded to
`{ changed: [] }`. This LLD replaces both with real logic — no route signature change needed, but two
call sites need rewiring, not one:

1. **`packages/core/src/server/container.ts:32-33,46`** — `const kdg = new EmptyKdgContextProvider();`
   becomes `const kdg = new KdgService(kdgStore);`, still passed into both
   `container.kdg` (for the REST route) and `new CoreAuthoringService(kdg)` (see next point).
2. **`packages/core/src/authoring/kdg-context.ts`** — `KdgContext`/`KdgContextProvider` are the *old*
   stub shape (`{ routes: [...], conditionals: unknown[] }`), separate from and incompatible with this
   LLD's `shared`-typed `KdgContext` (§2). `CoreAuthoringService.context()`
   (`packages/core/src/authoring/index.ts:9,19-20`) is typed against the old interface and is a real
   second consumer beyond the REST route. This LLD deletes `kdg-context.ts` entirely and repoints
   `CoreAuthoringService`'s constructor + `context()` method at the new `shared` `KdgContext` type
   directly — there is no dual-shape transition period; both call sites move together in the same change.

## 5. Repair payload integration

`RepairPayload.kdg` (`packages/shared/src/schema/dto.ts`, currently `z.unknown()`) becomes
`KdgContext.optional()` — optional because a step's route may not resolve cleanly (e.g. a dynamic route
segment) and healing must not hard-fail on a missing map. `CoreHealingService.buildRepairPayload`
(`packages/core/src/healing/index.ts`) calls the same `KdgService.getMap` used by the MCP tool, scoped to
the failing test's `groundedUrl`.

## 6. Storage (extends LLD-007 §3, same cache tier)

New tables in the existing `.gimbal/cache.db`, migrated the same way as every other cache table
(`migrate.ts`, `CREATE TABLE IF NOT EXISTS`):

| Table | Purpose | Key columns |
|---|---|---|
| `kdg_nodes` | one row per graph node, current version only | `id (pk), route, file_path, tag, role, label, anchors_json, parent_id, child_ids_json, conditional_json` |
| `kdg_manifest` | per-file content hash for staleness diffing | `file_path (pk), content_hash, last_built_version` |
| `kdg_versions` | monotonic version counter + build timestamp, for `getDelta` | `version (pk), built_at` |

```ts
export interface KdgStore {
  getManifest(): KdgManifestEntry[];
  getNodesForRoute(route: string): KdgNode[];
  replaceNodesForFiles(filePaths: string[], nodes: KdgNode[]): void; // per-file patch, §3.6
  getVersion(): string;
  bumpVersion(): string;
  diffSince(version: string): KdgDelta;
}
```

Regenerable, git-ignored — same invariant as every other cache table (LLD-007 §6): deleting `cache.db`
costs a full rebuild on the next `getMap` call, never data loss, since nothing here is a durable authored
artifact.

## 7. Boundaries & guarantees

- **No LLM call anywhere in this LLD.** `parse.ts`/`trace.ts` are pure static analysis; `needs_trace`
  and `unknown` are terminal outputs of construction, not inputs to a follow-up model call within core.
  Any actual tracing of a `needs_trace` hint happens in the *consuming agent's own session*, outside
  Gimbal's process — Gimbal never dispatches that follow-up itself.
- **Never used at runtime.** Grounding, the resolver, and execution do not read `KdgService` — this
  stays strictly authoring/repair-time context, unchanged from ADR-002's original scoping.
  `PlaywrightGroundingService`/`MultiSignalResolver`/`PlaywrightTestRunner` gain no new dependency on
  `kdg/`.
- **Never the whole graph over the wire.** `getMap` is always route-scoped (§4); there is no code path
  that serializes every node in `.gimbal/cache.db` into one response.
- **Deleting `cache.db` loses only speed** — same guarantee as every other cache table (LLD-007 §6).
- **Next.js App Router only, enforced by discovery, not a runtime check** — `discover.ts` simply finds
  nothing to track in a project with no `app/` directory; this degrades to an empty graph rather than an
  error, so a non-Next.js project doesn't crash `getMap`, it just gets nothing useful from it (documented
  limitation, not a special-cased guard).

## 8. Definition of done

- `discover.ts` finds every `page.tsx`/`layout.tsx`/`route.ts` and their transitive local imports in a
  real Next.js App Router fixture project.
- `parse.ts`/`trace.ts` classify every conditional branch in that fixture into exactly one of
  `resolved`/`needs_trace`/`unknown`, with `needs_trace` hints pointing at real, correct file/line
  locations.
- Editing one component and re-calling `getMap` on a route that imports it produces a `getDelta` showing
  only that component's node(s) as `changed` — not a full-graph diff.
- `RepairPayload.kdg` is populated with real structure for a stale step whose route resolves cleanly.
- No test, lint, or type-check path in `kdg/` imports anything from `@anthropic-ai/sdk` or any other
  model client.
