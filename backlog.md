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
- 1.7 result (45-cell fixture bench, 2026-10-09, mutations that break the stored selector): false positives 23 -> 3, located 10 -> 9, abstained 1 -> 16. Precision is fixed by the heal ambiguity rule; **recovery is weak (9 of 27 same-element cells)**. `wrapper-insert` recovers 0 of 9: the added wrapper changes the target's structure/context path while its siblings keep theirs, so those signals penalise the right element. Needs signal rebalancing, tuned on a train split and reported on held-out (plan 4.4). Numbers in `packages/bench/results/`.
- Bench: 3 remaining false positives are all `removed` (a different button above the 0.05 margin). `label-synonym` never needs a heal because a durable selector survives, so it says nothing about semantic recovery; a mutation that changes both label and attributes is needed.
- 3.2: the test detail page only links to open repairs; per-step "original target vs current target + evidence" is not shown there yet. Run detail still shows the old per-step resolution panel.
- 3.4: semantic assertion detail is not built (Phase 5 is not started).
- 3: Repairs page and test list verified in a browser against the demo (accept works); other pages were not re-checked visually.

## Not done in this pass (needs you, or deliberately skipped)

- **Phase 0 / publication gate (yours):** consent from the original author, the licence wording (open questions 12.1–12.3: consultancies, change date, copyright holder), `gitleaks`, remotes. `LICENSE` text is untouched; only the per-package copies were synced to it.
- **8.1 history rewrite, 8.6 Verdaccio dry run, 8.7 publish:** not run. Rewriting history and publishing are irreversible and external.
- **8.4** dependency advisory review (`npm audit --omit=dev`) and `THIRD_PARTY_NOTICES` not done.
- **Phase 5 (semantic output assertions), 4.3, 6.4 (chatbot demo), 3.4:** skipped as the plan's first cut. No semantic assertion exists in this alpha, and the docs do not mention it.
- **6.5** a manual run with a real agent (fresh Claude Code, then a second MCP client) has not been done; the skill is untested with one.
- **4.5** latency report (cold start, first ground, cached run per step vs plain Playwright) is not written. The bench only reports whole-run time.
- **docs/evolution.md** not written.
- **Benchmark honesty:** Gimbal matches a plain role+name locator on these fixtures and does not beat it. Recovery of unlisted synonyms and translations is 0–3 of 22 by design. Improving that needs a stronger (e.g. multilingual) pinned embedding model evaluated on a train/held-out split; do not claim it before then.
- The `tests/` subfolder of `.gimbal/` stays tracked on purpose; everything else under `.gimbal/` is ignored by `gimbal init`.
