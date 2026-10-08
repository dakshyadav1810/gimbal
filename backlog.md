# Backlog (deferred items found during Alpha plan execution)

- 1.1: add a real `FsArtifactStore` temp-dir test proving a `maintain` patch survives a reload.
- 1.2: add an end-to-end test that a typed password never reaches `candidates.json`; check ARIA snapshot and other artifacts for typed values; redact URL query/hash in persisted artifacts (run urls, network logs).
- 1.11: embedding config is flat (`embeddingModel` + `embeddingRevision`) rather than the plan's nested `{model, revision}`; revision hash pinned from the HF API on 2026-10-09. Add a doctor check for model availability offline.
- Known-gap resolver sandbox cases (modal duplicate buttons, popup, virtualized list, file input, product-card CTA) still fail by design.
- Bench baseline (login-submit, 2026-10-09): resolver clicks a wrong element on `duplicate-added` and `removed` (2 of 5 mutations are false positives). Targets for 1.4 (outcome verification) and 1.7 (ambiguity policy).
- 1.9: step timings (`extractMs/resolveMs/actMs`) need a `step_results` column to survive `GET /runs/:id`; lazy `domHash` changes cache semantics (the cache key includes the DOM hash), so measure first with the bench before touching it.
- 1.11: add a route test for the 409 `model_mismatch` on `POST /runs`, and an offline check (`HF_HUB_OFFLINE`) in `gimbal doctor`.
- 1.3: `runId` is not recorded on repairs (heal path has no run context). Rejected-selector blocking only covers heals, not the proposal-reuse path.
- Bench: `duplicate-added` truth is "ambiguous", so even clicking the original counts as a false positive; revisit whether that is the right scoring once abstention exists (1.7).
- 2.5: `getPage` also should capture on `exploreUiState` and (with `snapshots: always`) after runs; only grounding and `refresh` capture today. Page snapshots are not yet excluded by a generated `.gimbal/.gitignore` (comes with `gimbal init`, 2.2).
- 2.5/Phase 7: the knowledge-graph docs (docs/lld/LLD-011-kdg.md, docs/specs/SPEC-006-kdg.md and mentions in README/ADRs/LLDs) still describe the removed feature; cleanup belongs to the docs phase.
- 2.8: `/api/reviews` and `/api/tests/:id/reviews` are kept as derived views for the old dashboard page until Phase 3 replaces it with a Repairs page.
- Bench harness: cells without a heal log a harmless ENOENT for repairs.json; check existence first.
- 2.3: `gimbal doctor` checks the embedding model by looking for its cache directory only; it does not verify the pinned revision. Offline (`HF_HUB_OFFLINE`) handling is untested.
- 2.7: `--workers` (parallel runs) deliberately deferred. No example GitHub Actions workflow yet (Phase 8.5).
- 2.1: the skill has not been tried with a fresh agent (manual gate in the plan).
