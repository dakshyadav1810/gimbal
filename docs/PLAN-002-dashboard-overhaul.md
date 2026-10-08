# PLAN-002: Dashboard Overhaul — Fix What's Broken, Cut the Decoration

**Status:** Proposed
**Date:** 2026-09-13
**Relationship:** Corrects the dashboard's visual execution against AGENTS.md's own stated philosophy
("resemble browser developer tools, trace viewers, API inspectors, observability dashboards") and
[SPEC-005](specs/SPEC-005-mcp-cli-dashboard.md). Not an architecture change — the dashboard stays a
thin, read-mostly client (invariant #3); this plan only touches `packages/dashboard/src`.

## Context

The dashboard reads as a generic AI-generated SaaS-landing-page template, not a developer tool — and
that's not just a style complaint. Reading every page and component (not sampling) turned up specific,
verifiable defects, not merely "the vibe is off":

1. **`JsonEditor.tsx` has no save action, and none exists to wire up.** You can edit the spec JSON,
   get live parse-error feedback, and every keystroke goes nowhere — there is no update/PATCH endpoint
   in `server/routes.ts` at all (`saveSpec` only ever runs once, at creation, via `POST /tests`). The
   entire "Spec Configuration JSON" panel on `TestDetailPage` is decorative.
2. **`TestDetailPage.tsx`'s "Loading spec..." is not a loading state — it's a permanent fallback with
   no error path.** `{test?.flow.name ?? "Loading spec..."}` shows that string forever if the fetch
   fails, not just while it's in flight. This is almost certainly the exact "stuck loading" symptom
   reported.
3. **`TestListPage.tsx`'s two per-card links are dead duplicates.** "Configure Spec →" and
   "View Details" both point at the identical `/tests/${t.testId}` — two buttons, one destination,
   no distinction a user can act on.
4. **Multiple invalid Tailwind color utilities that silently no-op**: `text-amber-455`,
   `dark:text-rose-455`, `dark:text-rose-450`, `text-neutral-550`, `text-neutral-450`,
   `border-neutral-850`, `dark:text-indigo-405` (found in `TestListPage.tsx`, `ReviewQueuePage.tsx`).
   Tailwind's default scale only has 50/100/.../900/950 — these numbers don't exist, so the class
   applies no color at all and the element silently falls back to inherited text color. Several
   stat-card numbers and status badges are rendering in the wrong (unstyled) color right now.
5. **Decoration crowds out information density**, the opposite of what a devtool needs: gradient logo
   badge with a pulsing "liveness" dot that doesn't reflect real liveness, gradient text-clip on the
   wordmark, glassmorphic blur on every panel, glow shadows on buttons, `animate-ping`/`animate-pulse`
   on static elements, emoji as the primary iconography (📁 ✓ ⚡ ⚠️ 🔍 📂 📭 🎉 📊 ▶) throughout. None of
   this is wrong in isolation; together it's why it reads as a template rather than a tool someone
   who takes Gimbal seriously would trust.
6. **No consistent design system** — `.glass-panel` is the only shared primitive; radius, shadow,
   spacing, and badge-color conventions are re-invented per page with slightly different values each
   time (e.g. badge styling is redefined three separate times across `StepTable.tsx`,
   `ResolutionPanel.tsx`, and `RunHistoryPage.tsx` instead of shared).

## Design direction

**Principle: information first, chrome last.** Every visual choice should make data easier to scan,
not decorate the page. This is the standard other serious dev tools (Playwright's trace viewer,
Chrome DevTools, Linear, Vercel's dashboard) already converged on: dense, monospace-friendly, mostly
neutral, color used only to mean something (status, band, severity) — never for atmosphere.

**Concretely, cut:**
- All gradients (text-clip, button fills, logo badge)
- Glassmorphism / backdrop-blur panels → flat panels, one real border, one real background
- Glow/colored shadows (`shadow-brand-primary/20` etc.) → flat `shadow-sm` or none
- `animate-pulse`/`animate-ping` on anything that isn't communicating real, live state
- Emoji as icons → a single small SVG icon set (16-20px, stroke-based — e.g. Lucide, MIT-licensed,
  already common in devtools) used consistently for the ~10 recurring concepts (spec, run, review,
  passed, failed, warning, search, back, external link, settings)
- Decorative micro-copy ("Beautiful futuristic double-circle emblem logo") and marketing-toned labels
  ("Premium glassmorphic cards") — these are comments, but they're symptomatic of the same instinct
  that produced the visual style

**Concretely, keep/formalize:**
- Light/dark via `prefers-color-scheme` (already correct, no manual toggle needed for a local tool)
- The existing information architecture (Tests → Test Detail → Runs → Run Detail; Review Queue →
  Review Detail) — it's sound, the problem is execution, not structure
- `JetBrains Mono` for anything identifying (IDs, selectors, timestamps) — already a good instinct,
  just needs to be used more consistently
- Tailwind + the existing component boundaries (`StepTable`, `ResolutionPanel`, `Screenshot`,
  `JsonEditor`, `Nav`) — no framework or library change

**One small design system, not a component library:** a single `tokens.css` (or extend `styles.css`)
defining: 2 surface levels (page background, panel background), 1 border color per mode, 1 radius
scale (2 values: `md` for panels, `sm` for chips/badges), 1 shadow (`sm`, used sparingly — mostly none),
and the semantic status colors already implied by the code (`passed`/`failed`/`warning`/`stale` and
`high`/`medium`/`low` band) defined **once** and imported everywhere instead of redefined per file.

## Page-by-page

- **Nav**: drop the gradient logo badge and pulsing dot; a plain wordmark + the two nav links. Replace
  the fake "Port: 4319" liveness pill with something real or remove it — if core's `/health` isn't
  already polled, don't fake liveness with animation.
- **TestListPage**: keep the 4 stat tiles but flatten them (no hover-scale, no glass blur); collapse
  the two duplicate links per card into one ("Open"); fix the invalid color classes.
- **TestDetailPage**: give `useTest` a real loading vs. error vs. not-found distinction (`isLoading`,
  `isError` from the query) instead of a single optional-chained fallback string. Either wire
  `JsonEditor` to a real save flow (new `PATCH /tests/:id` + `updateSpec` in `ArtifactStore`, re-running
  grounding on save since Tier-1 authoring changes invalidate cached resolutions) or remove the editor
  and replace it with a read-only spec viewer until that round-trip is actually built — a decorative
  editor is worse than no editor.
- **RunHistoryPage**: least broken page today; mostly needs the shared badge/token cleanup, no
  structural change.
- **RunDetailPage / StepTable / ResolutionPanel**: keep the Phase 5a resolution-panel work from this
  session as-is functionally; restyle to the new flat system. Consolidate the three separately-defined
  status/band color maps into one shared module.
- **ReviewQueuePage / ReviewDetailPage**: same token cleanup; fix the invalid `rose-450` class.

## Explicit non-goals

- No new pages, no new features, no drift-ledger UI (that's Phase 5b, a separate, already-tracked
  piece of work)
- No component library adoption (no shadcn/Radix/etc. wholesale swap) — the existing component
  boundaries are fine, they're just styled inconsistently
- No client-side state management change (React Query usage is already correct and stays)
- No animation removal where it's actually communicating something real (e.g. a genuinely live WS
  connection indicator, once real, may still pulse — the objection is to *fake* liveness signals)

## Phased implementation

**Phase A — Fix the real bugs (small, do first, independent of any visual work):**
1. Fix all invalid Tailwind color classes (5 min grep-and-replace with valid scale values)
2. Collapse `TestListPage`'s duplicate per-card links into one
3. Give `TestDetailPage` real loading/error states for `useTest`
4. Decide and act on `JsonEditor`: either build the save round-trip (`PATCH /tests/:id` +
   `ArtifactStore.updateSpec` + re-ground-on-save) or replace it with a read-only viewer — don't ship
   a control that silently does nothing

**Phase B — Design tokens + shared primitives:**
1. Add the flat token set to `styles.css` (surfaces, border, radius, one shadow, status colors)
2. Extract one shared status/band badge component (currently redefined 3x) and one icon module
3. Remove `.glass-panel`, gradients, glow shadows, decorative animation from the token layer so
   nothing new can reintroduce them by copy-paste

**Phase C — Page-by-page restyle**, in order of how often each is looked at: TestListPage → Nav →
TestDetailPage → RunDetailPage/StepTable/ResolutionPanel → RunHistoryPage → ReviewQueuePage/
ReviewDetailPage. Each page: swap emoji for the icon set, apply the token system, verify no visual
regression in light AND dark mode (screenshot both).

**Phase D — Verify:** add the dashboard test infrastructure this project doesn't have yet (Phase 5c
from the Q2 plan — Vitest + Testing Library + jsdom), at minimum for the two pages that had real logic
bugs (`TestDetailPage`'s loading/error branching, `TestListPage`'s link dedup) so these don't silently
regress again.

## Effort

Phase A: S (bug fixes, no design work — could ship same day). Phase B: S-M (one token file, two
extracted components). Phase C: M (six pages, mechanical once B exists). Phase D: S (a handful of
targeted tests, not full coverage).

Total: **M**, most of it Phase C's page-by-page pass, none of it architecturally risky since the
dashboard's read-only, thin-client boundary (invariant #3) is completely unaffected.
