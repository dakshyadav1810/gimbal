# RESEARCH-001: State of the Art & Technical Roadmap

**Status:** Draft (research input, not a decision record)
**Date:** 2026-09-10
**Purpose:** Position Gimbal against the academic and industrial state of the art in web element
localization, self-healing, deterministic replay, and test observability; identify concrete techniques,
algorithms, and standards to implement; and answer three open questions — resolver reliability on dirty
DOMs, the dashboard as an evaluation surface, and whether Gimbal can extend into AI-pipeline verification.
**Companion to:** [DISCUSSION.md](DISCUSSION.md), [LLD-004](lld/LLD-004-resolver.md), [ADR-001](adr/ADR-001.md).

> This document is written for the bachelor's-thesis framing: the goal is a *technically defensible,
> well-evidenced* system, not only a marketable one. The through-line is the original thesis —
> **probabilistic agents must not sit in the test runtime** — now restated with the empirical support
> that exists in the literature.

---

## 0. The thesis, restated with evidence

The claim "keep the LLM out of the runtime" is not a stylistic preference. Three independent results
support it:

1. **Flake misclassification hides real regressions.** A case study on the Chromium CI found that
   ML-based flaky-vs-fault classifiers marked **~76% of genuinely fault-triggering failures as "flaky"**
   — a team trusting that classifier would have missed 76% of the regressions its suite actually caught
   ([Discerning Flaky from Fault-triggering Failures, arXiv:2302.10594](https://arxiv.org/pdf/2302.10594)).
   A runtime that is *deterministic by construction* has no flake to classify, so this failure mode
   cannot occur.

2. **Runtime LLM healing is "heal until green."** Playwright's own first-party **Healer** agent (v1.56+)
   "runs a repair loop… re-runs until the test passes or guardrails stop the loop"
   ([Playwright Agents](https://www.shiplight.ai/blog/playwright-agents)). This is structurally the same
   pathology as reward hacking: an optimizer told "make it pass" will find a way to make it pass,
   including by acting on the wrong element. The self-healing literature names this directly — *"the
   biggest danger is false positives: the test runs green but validates the wrong thing… most tools
   don't explain what they healed"*
   ([TreeifyAI](https://treeifyai.medium.com/self-healing-tests-whats-real-what-s-marketing-d13af687c865)).

3. **Determinism does not cost accuracy here.** The 2025 large-scale replication of the Similo family
   (280,233 localization attempts) shows a *deterministic* optimized locator (Similo++) reaching
   **99.4% recovery**, matching or beating the GPT-4-in-the-loop variant (LLM VON Similo, ~95% on its
   own benchmark) at a fraction of the cost and with full reproducibility
   ([Web Element Relocalization, arXiv:2505.16424](https://www.arxiv.org/pdf/2505.16424)).

4. **LLM-as-judge is ~85% reliable.** Even the best current LLM judges agree with humans about 85% of
   the time ([DeepEval](https://deepeval.com/blog/llm-as-a-judge)). For a *merge gate* — a binary,
   high-stakes, high-frequency decision — a 15% disagreement rate on the oracle is disqualifying.

**Where Gimbal sits in the literature.** Gimbal's resolver is a member of the **similarity-based /
multi-signal web element relocalization** family — the approach that systematic reviews identify as the
current state of the art for repairing broken web tests
([arXiv:2505.16424](https://www.arxiv.org/pdf/2505.16424)). Its lineage:

```
ROBULA+ (single robust XPath, Leotta 2016)
   │
   ▼
LML / Multi-Locator (voting over 5 single-locators, Leotta 2015)
   │
   ▼
Similo (weighted similarity over 14 element properties, Nass/Leotta 2022)   ← Gimbal's closest ancestor
   │
   ├── VON Similo (visual overlap grouping, 2023)
   ├── LLM VON Similo (GPT-4 re-ranks Similo's top-10, 2024)
   └── Similo++ / HybridSimilo (GA-tuned weights + richer similarity fns + visual cascade, 2025)
```

Gimbal already extends plain Similo in four ways the literature has only partially explored:

| Gimbal element | Similo | Literature status |
|---|---|---|
| semantic signal = **local ONNX sentence embeddings + cosine** | Levenshtein on visible text | LLM VON Similo tried GPT-4 (non-deterministic, paid); Gimbal's local-embedding variant is the deterministic middle ground and is **under-studied** |
| **affordance gate** (role/action compatibility, hard filter) | none (Similo scores everything) | novel as a pre-filter; partially in WATER's `clickable` property |
| **page-archetype-aware dynamic weights** (MoE) | fixed weights | LML explored voting variants; dynamic re-weighting per page is Gimbal-specific |
| **confidence banding + explicit `stale`** (refuse to guess) | *stated open problem* — "without a threshold Similo returns a wrong element when the target isn't loaded yet" | Similo §6 explicitly flags this as unsolved future work |

So the honest thesis contribution is: **take the Similo family from "locator repair benchmarked on
archived homepages" to "a deterministic, self-auditing verification runtime validated on dirty,
framework-diverse, form-heavy real applications,"** and close Similo's own stated open problem (the
threshold / synchronization gap) with the banding + actionability gate.

---

## 1. The resolver on real-world dirty DOMs (Question 1)

### 1.1 The reference numbers

Non-location rate (element could not be found / wrong element found) on evolving real websites:

| Approach | Non-located | Source |
|---|---|---|
| Absolute XPath | ~79% | Similo study, 40 sites × 2 versions |
| Relative ID-based XPath | ~59% | " |
| ROBULA+ (best single-locator) | ~35–39% | " |
| LML (multi-locator, theoretical limit) | ~24–27% | " |
| **Similo** | **~11–12%** | [arXiv:2208.00677](https://arxiv.org/pdf/2208.00677) |
| Similo++ (GA-tuned, extended benchmark) | ~0.6–1% (4-month gaps) / ~8–13% (1–5 year gaps) | [arXiv:2505.16424](https://www.arxiv.org/pdf/2505.16424) |
| LLM VON Similo (GPT-4 re-rank) | ~5% (804 pairs) | [arXiv:2310.02046](https://arxiv.org/pdf/2310.02046) |

**Caveat that matters for the thesis:** every one of these benchmarks uses *homepage* elements from the
Internet Archive — links, headings, nav items, images. None covers **form inputs, selects, tables,
modals, virtualized lists, or shadow DOM**, and none validates against a *real running test suite*
(Similo++ authors state this explicitly as a limitation). That gap is Gimbal's empirical opening.

### 1.2 Concrete upgrades to lift the resolver, ordered by leverage

**(a) Adopt the Similo++ property set and similarity functions.**
The 2025 GA-optimization study measured cross-version *stability* per property and learned per-property
weights. Highest-value, currently missing or under-weighted in Gimbal:

- **`type` attribute** — 95–96% cross-version stability, the single most stable property measured. Gimbal
  already emits it for uniqueness checks (DECISIONS #26); promote it to a weighted structure sub-signal.
- **`aria-label`** — 81–84% stability; feed into both semantics and structure.
- **Richer string similarity**: add **Jaro-Winkler** (better for short labels), **Jaccard / token-set
  similarity** (word-order-independent, good for `nearbyText` and multi-word labels), **Manhattan /
  exponential-decay** for geometry. Gimbal currently leans on embeddings + Levenshtein-ish comparisons;
  a small ensemble of cheap string metrics as tiebreak features is nearly free.
- **Deprioritize** `class`, an `isButton`-style boolean, and absolute XPath — the GA consistently
  assigned these **near-zero weight**. This confirms Gimbal's own instinct (DECISIONS #7, #23) and should
  be made explicit in [LLD-004](lld/LLD-004-resolver.md).

**(b) Learn the signal weights from data instead of hand-setting them — demoted, see 2026-09-13 correction below.**
Gimbal's `semantics 0.45 / context 0.33 / structure 0.22` is asserted, not derived
([LLD-004 §5](lld/LLD-004-resolver.md)). The literature's biggest single accuracy jump (86.6% → 91.7%
exact match) came purely from **genetic-algorithm weight tuning with temporal cross-validation**
([arXiv:2505.16424](https://www.arxiv.org/pdf/2505.16424)).

> **Correction (2026-09-13):** on review this was over-weighted in the original draft — a real,
> literature-backed technique reached for partly because it reads as rigorous, not because the product
> needs it yet. The 5.6pp gain it buys is small next to the ~68pp gain the *architecture* already
> provides (79% non-located with absolute XPath → 11–12% with Similo-style multi-property matching,
> before any weight tuning at all — [arXiv:2208.00677](https://arxiv.org/pdf/2208.00677)). It also has a
> real precondition Gimbal doesn't yet have: a **labeled corpus of confirmed correct relocalizations**,
> which does not exist pre-launch and would have to be scraped/synthesized, risking a weight vector
> tuned to an unrepresentative sample — the opposite of "bulletproof." And a learned, opaque weight
> vector cuts against the transparency the dashboard chapter (§2) promises ("won because: X" is a weaker
> sentence when X is a coefficient no one hand-verified). **Status: moved out of the roadmap's Tier 1.**
> It is legitimate as a later **ablation study** — show hand-set, auditable weights against a GA-tuned
> variant on the benchmark from §1.4, and report whether the accuracy gain (if any) is worth the loss of
> interpretability — but it must not gate the product, and the benchmark in §1.4 must be built as a
> **measurement corpus** (score existing behavior) long before, if ever, it becomes a **training corpus**
> (fit new weights to it). See Tier 1 in §4, which now leads with the benchmark and the extraction gaps
> instead.

**(c) Make the accessibility tree a first-class signal source.**
Playwright's `getByRole` and Testing Library's whole philosophy rest on the **W3C Accessible Name and
Description Computation** spec ([w3.org/TR/accname](https://www.w3.org/TR/accname/)): resolve an
element's role and accessible name the way assistive tech does, and you get an identifier that survives
CSS refactors and DOM reshuffles because it is tied to *meaning*, not structure
([ModelPiper: accessibility-native testing](https://modelpiper.com/blog/accessibility-native-testing-ax-selectors)).
Gimbal should compute the AccName per spec (not ad-hoc text scraping) and treat `(role, accessibleName)`
as a distinct high-weight signal. Bonus: it doubles as a lightweight accessibility check, and it aligns
with a **2026 sibling result** — "Beyond LLM-based test automation: A Zero-Cost Self-Healing Approach
Using DOM Accessibility Tree Extraction" ([ResearchGate 403070986](https://www.researchgate.net/publication/403070986))
— which argues exactly Gimbal's thesis: the a11y tree gives you self-healing without a runtime model.

Also adopt **Playwright ARIA snapshots** (`toMatchAriaSnapshot`,
[playwright.dev/docs/aria-snapshots](https://playwright.dev/docs/aria-snapshots)) as a DOM-blind
*structural regression oracle*: assert the shape of a region in accessibility vocabulary, which changes
far less often than the DOM and is human-reviewable in a diff.

**(d) Solve the icon-only / signal-less element problem — the universal failure mode.**
Similo, Similo++, and VON Similo *all* cite icon-only elements as the persistent unsolved case
("icons lack DOM-based distinguishability"). This is Gimbal's best shot at a genuinely novel contribution:

- **Local vision model for icon semantics.** OmniParser V2 ([microsoft/OmniParser](https://github.com/microsoft/OmniParser),
  [arXiv:2408.00203](https://arxiv.org/abs/2408.00203)) is a fine-tuned **YOLO** icon detector + a
  **Florence-2** caption model that produces *functional* descriptions of icons ("this is the settings
  gear"). It has **fixed offline weights and makes no API call** — the same category as the ONNX
  embedding model Gimbal already ships, so it stays inside the ADR-001 invariant. Run it only when a
  candidate has no text/aria signal; feed the caption into the semantic signal.
- **HybridSimilo cascade.** The 2025 study's best structure for hard cases: **visual-overlap coarse
  clustering first, structural refine second** ("VON Similo++ pre-selects candidate clusters using
  visual overlap; Similo++ refines to exact target"). Gimbal's spatial signal is the first half; add the
  cascade ordering.

**(e) Structural signal via tree edit distance.**
Replace / supplement string-XPath comparison with **APTED** (Pawlik & Augsten; empirically O(n·log n),
supersedes RTED/Zhang-Shasha; [DatabaseGroup/tree-similarity](https://github.com/DatabaseGroup/tree-similarity))
computed between the grounded element's local context subtree and each candidate's subtree. Tree edit
distance is robust to node reordering and wrapper insertion/deletion — exactly the changes that break
XPath but preserve intent. This is well-trodden in web *data extraction* (wrapper adaptation) and
under-applied to test repair.

### 1.3 Making the DOM less dirty before the resolver runs — the determinism playbook

The resolver only addresses **selector drift, which is ~28% of E2E failures**; the other ~70% is
"timing issues, test data problems, runtime errors, rendering failures"
([TreeifyAI](https://treeifyai.medium.com/self-healing-tests-whats-real-what-s-marketing-d13af687c865)).
If Gimbal does not own that 70%, the resolver's gains are invisible in practice. The literature and the
platform both point the same way:

- **Freeze time.** Adopt the **Playwright Clock API** (`setFixedTime` / `pauseAt` / `fastForward`,
  [playwright.dev/docs/clock](https://playwright.dev/docs/clock)) so timers, `Date`, TTLs, and
  date-based UI are deterministic. This is the productized form of the **Dolos / Timelapse / McFly**
  deterministic-replay research line ([McFly, arXiv:1810.11865](https://arxiv.org/pdf/1810.11865);
  Timelapse/Dolos, UIST 2013).
- **Pin the network.** `routeFromHAR` record/replay
  ([playwright.dev/docs/mock](https://playwright.dev/docs/mock)) — record real traffic once, replay
  deterministically. Combined with the clock, *"the rendered UI becomes a pure function of your
  fixtures."* Gimbal should offer this as a first-class grounding mode (record HAR during the grounding
  run, replay it at test time), with a freshness toggle.
- **Quiesce hydration and animation.** Gimbal has `waitForPageHydration` (DECISIONS #25/#26); formalize
  and document it as: `networkidle` → `MutationObserver` silence window → layout-stability (`≤1px` over
  100 ms, already in `auto-wait.ts`) → hit-test. Cite it against the auto-wait literature and Similo's
  own "rerun the localization until elements load" hand-wave — Gimbal's 3-stage gate is the concrete
  answer to Similo §6's open problem.
- **Isolate the run.** Per-test browser context; `storageState` for auth reuse (skip login UI — the
  literature's #1 agent-authoring breakage); DB fixture/transaction rollback hooks; seeded RNG. Playwright
  contexts give this cheaply ([QASkills: contexts & isolation](https://qaskills.sh/blog/playwright-browser-contexts-isolation-guide)).
- **Move toward WebDriver BiDi.** [W3C WebDriver BiDi](https://www.w3.org/TR/webdriver-bidi/) is the
  cross-browser standard replacing the Chrome DevTools Protocol; as of 2026 Firefox, Puppeteer, and
  Cypress have production support and Playwright is exploring it
  ([Chrome for Developers](https://developer.chrome.com/blog/webdriver-bidi)). Standardized event streams
  (network, console, DOM mutation) future-proof Gimbal's multi-browser story and its telemetry.

### 1.4 The benchmark contribution (the empirical spine of the thesis)

Similo++ explicitly calls for **standardized E2E relocalization benchmarks** and notes that no approach
has been validated on real suites, forms/tables/selects, or framework diversity. A thesis-grade
deliverable:

- **Corpus:** element-relocalization tasks mined from the *git history* of real open-source
  Next.js / React / Vue apps (not archived homepages), deliberately including forms, multi-step flows,
  modals, virtualized lists, shadow DOM, and `useId`-style volatile-ID frameworks.
- **Baselines:** Gimbal's resolver, Similo / Similo++ (open-source Java wrapper exists), Playwright's
  `getByRole`, Playwright's Healer agent.
- **Headline metric:** **false-positive rate** (confidently resolved to the wrong element) at each
  confidence band, alongside recall and time. This is the number that substantiates "when Gimbal is
  green, it's green."
- **Secondary:** flake rate before/after the §1.3 determinism playbook, on a fixed app + fixed code.

This is publishable on its own and it is the "proof behind the intuition" the thesis needs.

---

## 2. The dashboard as the evaluation surface (Question 2)

### 2.1 The reference bar

Two products define what developers expect:

- **Playwright Trace Viewer** ([playwright.dev/docs/trace-viewer](https://playwright.dev/docs/trace-viewer)).
  Its winning properties: **time-travel with interactive DOM snapshots** (you hover real elements at any
  past moment, not just screenshots), a synced action list + Gantt timeline + network + console, and
  **portable failure context** — attach the trace file, no repro steps needed, "decoupling the failure
  from the environment."
- **Currents** ([currents.dev](https://currents.dev/playwright)) — the Playwright CI dashboard: run
  history, **per-test flake score from real pass-rate**, failure grouping, trace/video/console
  centralized across CI machines, real-time streaming that survives a runner crash.

Gimbal should not rebuild either. It should **embed the Playwright trace format / `@playwright/trace-viewer`**
as a route and spend its own effort on the one thing those tools cannot show: *why the deterministic
resolver decided what it decided.*

### 2.2 What Gimbal's dashboard uniquely must render

The dashboard is the thesis rendered as UI: it exists to make a *machine-made verdict auditable without
re-running it.* Every self-healing critique in the literature is "no logging, no rationale, no rollback"
([TreeifyAI](https://treeifyai.medium.com/self-healing-tests-whats-real-what-s-marketing-d13af687c865)),
and reviewers of AI-authored PRs explicitly want "evidence of test execution and confidence scores"
([arXiv:2606.15283](https://arxiv.org/pdf/2606.15283)). Concretely:

1. **Per-step resolution panel.** The ranked candidates for the step, each signal's sub-score, the
   margin to the runner-up, the band, and a plain-language "won because: unique accessible name
   *Sign in*, affordance-compatible, in-form context" line. This is the explainability nothing else has.
2. **Drift ledger.** Every runtime heal as a reviewable diff: old selector → new selector, confidence,
   before/after screenshot, the signals that survived. Exportable verbatim as the PR comment. This *is*
   the "evidence + confidence score" artifact the PR-review literature asks for.
3. **Determinism report per run.** What was pinned (clock, HAR), what was not, and a reproducibility
   hash of `(grounded test, fixtures, config)`. A green with a full-determinism stamp is a different
   epistemic object than a green without one, and the dashboard should say so.
4. **Stale review queue.** Failing snapshot + low-band candidates + one-click "copy repair payload for
   agent" (already in [LLD-010](lld/LLD-010-dashboard.md)).
5. **Embedded time-travel trace** per step (Playwright trace viewer, not reimplemented).

### 2.3 Thesis angle

Frame the dashboard chapter as: *"What must a developer or agent see to trust a machine-healed test
verdict without re-executing it themselves?"* Run a small user study (5–10 developers): give half the
raw pass/fail, half the resolution panel + drift ledger, measure trust calibration (do they correctly
accept true heals and reject wrong ones?). This is a tractable HCI sub-contribution that ties the UI
directly to the determinism thesis.

---

## 3. Pivots — qualitative checks for AI pipelines (Question 3)

Assessed honestly, best adjacency first. **Recommendation up front: do not pivot the engine; reframe
the consumer.** Gimbal's core — a deterministic web-state oracle + DOM-blind intent IR + assertions — is
reusable across all three targets below without change.

### 3.1 Deterministic verification harness for web agents (strongest, highest thesis novelty)

- **WebArena** ([webarena.dev](https://webarena.dev/), [arXiv:2307.13854](https://arxiv.org/abs/2307.13854))
  already proved the model: evaluate a web agent with a **deterministic environment + programmatic,
  state-based reward functions**, *not* an LLM judge. Its metric is end-to-end functional correctness:
  did the agent's actions bring the environment to a state satisfying the intent. It is "reproducible
  across runs."
- **WebVoyager** ([arXiv:2401.13919](https://arxiv.org/abs/2401.13919)) uses GPT-4V as the judge and is
  explicitly *not* deterministic — the same trade-off Gimbal already rejected at runtime.
- **Gimbal is the missing reusable infrastructure here.** A grounded Gimbal spec *is* a deterministic,
  state-based reward function with a human-readable intent. Reframed: an agent proposes a code change →
  Gimbal's grounded critical-path specs are the verdict → the drift ledger shows exactly what the
  agent's change moved in the UI. Same engine, new consumer: **regression-testing and benchmarking AI
  coding/browsing agents.**
- Related work to engage in the thesis: WebArena, WebVoyager, WAREX
  ([arXiv:2510.03285](https://arxiv.org/pdf/2510.03285)), StressWeb
  ([arXiv:2604.16385](https://arxiv.org/pdf/2604.16385)), and the "reward hacking ≈ over-healing"
  parallel (an LLM judge looping until pass is the same pathology as a healer looping until green).

### 3.2 Deterministic behavioral layer inside an LLM-eval stack (moderate, low cost)

- LLM-eval (DeepEval, promptfoo, G-Eval, RAGAS) is mature and crowded, and it is fundamentally about
  *grading probabilistic text* — LLM-as-judge at ~85% human agreement
  ([DeepEval](https://deepeval.com/blog/llm-as-a-judge)). Gimbal's determinism thesis does not transfer
  to grading free-text; do not compete here.
- **But there is a clean seam.** Vibe-coded apps (Lovable hit $200M ARR in year one,
  [Bug0](https://bug0.com/blog/vibe-coding-qa-problem)) have a UI, and the eval stack needs a
  *deterministic behavioral check* next to the qualitative ones: "does the generated form submit, does
  the row persist, does the nav work" (Gimbal, deterministic) vs. "is the copy on-brand, is the
  response helpful" (LLM judge, DeepEval). Position Gimbal as **DeepEval-for-behavior** — a `gimbal`
  assertion type that plugs into a promptfoo / DeepEval suite. Integration, not rivalry.
- Metamorphic testing is the relevant academic bridge for the oracle-free case
  ([Barr et al. oracle survey](https://eecs481.org/readings/testoracles.pdf); "Validating LLM-Generated
  Programs with Metamorphic Prompt Testing", [arXiv:2406.06864](https://arxiv.org/pdf/2406.06864)):
  when there is no ground truth, assert *invariants* ("re-generating with a paraphrased prompt should
  produce a UI that passes the same behavioral spec").

### 3.3 Visual / layout regression (weak as a pivot, worth keeping as a feature)

- The user was right not to hand-wave Chromatic / Percy / Applitools. Applitools **Visual AI** is
  CV-based (not pixel), "trained on billions of app screens"; Percy's review agent filters ~40% of
  rendering-noise false positives
  ([Percy](https://percy.io/blog/visual-regression-testing-tools)). These are entrenched and good.
- Gimbal's geometric assertions (`isRightOf`, alignment, `≤1px` delta — DECISIONS #25) are a
  **deterministic layout-invariant oracle that needs no golden image** — a real niche the CV tools
  underserve (they all require a baseline). Keep it as an assertion capability, not a product.
- Academic anchor for a thesis sub-chapter: responsive-layout-failure detection and cross-browser
  incompatibility (XBI) detection — X-PERT, WEBDIFF, and search-based layout repair (fixed 86% of
  layout XBIs, [ResearchGate 317300556](https://www.researchgate.net/publication/317300556)). Framing:
  *"deterministic layout oracles without a reference screenshot."*

### 3.4 Verdict on pivots

Keep one engine, three consumers:

| Consumer | Status | Effort | Thesis value |
|---|---|---|---|
| CI merge-gate for vibe-coding teams | primary | building | product spine |
| Deterministic reward/oracle for web-agent evaluation | research extension | medium | **high novelty** — nothing deterministic + reusable exists |
| Behavioral-assertion plugin in LLM-eval stacks | integration | low | breadth, ecosystem fit |

---

## 4. Prioritized roadmap (thesis-scoped)

**Tier 1 — makes the product actually reliable, and the thesis defensible as a side effect (re-sequenced
2026-09-13 — see the §1.2b correction; measurement before optimization, architecture before tuning):**

1. **The dirty-DOM benchmark, as a measurement corpus** (§1.4): framework-diverse,
   form/modal/virtualized/shadow-DOM, mined from real git history. Score Gimbal's *existing* resolver
   against it first — this is the empirical spine and the thing that tells you where to spend effort 2–5,
   instead of guessing.
2. **Close the extraction/engineering gaps §1.2 exposes and the memo's "known gaps" name**: shadow DOM
   piercing (or an explicit, surfaced "unsupported" rather than a silent wrong match), iframes, popups/
   new tabs, file uploads, virtualized lists. These are real dirty-DOM failure modes the Similo-family
   literature never even tests, and they cost more reliability than any weight change.
3. **Determinism playbook integration** (§1.3): Playwright Clock + `routeFromHAR` + formalized hydration
   quiescence + per-test isolation (`storageState`, DB fixture rollback). Deliverable: flake-rate
   before/after on a fixed app. This addresses the ~70% of E2E failures that aren't selector drift at all.
4. **Accessibility-tree signal** computed per W3C AccName + ARIA-snapshot structural oracle (§1.2c) and
   the `type` property + explicit deprioritization of class/xpath (§1.2a) — cheap, hand-set, auditable
   additions with direct literature support; no training data required.
5. **Resolver-aware dashboard** (§2.2): per-step resolution explainer + drift ledger + embedded
   Playwright trace viewer. Optional: the trust-calibration user study (§2.3).

**Tier 2 — raises the ceiling, higher effort/uncertainty:**

6. APTED tree-edit-distance structural signal (§1.2e).
7. Local vision model (OmniParser-style) for icon-only elements + HybridSimilo cascade (§1.2d) —
   highest novelty, highest risk, do last.
8. **Learned/GA-tuned signal weights — demoted from Tier 1.** Only once (1) has produced enough
   confirmed-correct relocalization examples to be a real training set, and framed as an **ablation
   study against the hand-set weights**, not a replacement for them. See the §1.2b correction: the
   expected gain (~5.6pp in the literature) is small, the interpretability cost is real, and the
   precondition (labeled corpus) doesn't exist yet.

**Tier 3 — extension chapter:**

9. Gimbal-as-web-agent-eval-harness: grounded specs as deterministic WebArena-style reward functions (§3.1).
10. WebDriver BiDi migration (§1.3).

---

## 5. Related-work map (for the thesis literature review)

**Robust element localization / relocalization**
- ROBULA+ — Leotta et al., robust XPath generation (SOTA single-locator).
- Multi-Locator (LML) — Leotta et al. 2015, voting over single-locators.
- Similo — Nass, Alégroth, Feldt, Leotta, Ricca; TOSEM 2022; [arXiv:2208.00677](https://arxiv.org/pdf/2208.00677).
- VON Similo / LLM VON Similo — Nass et al.; STVR 2024; [arXiv:2310.02046](https://arxiv.org/pdf/2310.02046).
- Web Element Relocalization: Comparative Analysis & Extension (Similo++, HybridSimilo) — 2025;
  [arXiv:2505.16424](https://www.arxiv.org/pdf/2505.16424); Springer EMSE 2026 (10.1007/s10664-026-10903-6).
- ATA / ATA-QV — Thummalapenta et al. / Yandrapally et al., neighbor-label anchoring.
- "Enhancing the Resiliency of Automated Web Tests with Natural Language" — ACM 2024.

**Test repair**
- WATER — Choudhary et al., ICPC 2011, differential test repair.
- WATERFALL — improves WATER with intermediate versions (209% more correct repairs).
- COLOR — Kirinuki et al., attribute+position+image repair (77–93% accuracy).
- Erratum — Brisset et al., DOM-tree-matching repair (67% better than WATER).
- VISTA — Stocco et al., FSE 2018, computer-vision test repair.
- "Beyond LLM-based test automation: Zero-Cost Self-Healing via DOM Accessibility Tree" — 2026;
  [ResearchGate 403070986](https://www.researchgate.net/publication/403070986). Closest sibling to Gimbal's thesis.

**Deterministic execution / replay**
- Timelapse / Dolos — Burg et al., UIST 2013.
- McFly — time-travel debugging for the web; [arXiv:1810.11865](https://arxiv.org/pdf/1810.11865).
- TimelyRep — timing-deterministic replay for web apps.
- Playwright Clock API; `routeFromHAR` — productized determinism primitives.

**Flaky tests**
- Luo et al., FSE 2014 — foundational empirical study of flaky-test causes.
- iDFlakies; FlakeFlagger; Flakify — detection/classification.
- FlakyLens — Understanding and Improving Flaky Test Classification, OOPSLA 2025;
  [cornell.edu/~saikatd/papers/flakylens-oopsla25.pdf](https://www.cs.cornell.edu/~saikatd/papers/flakylens-oopsla25.pdf).
- NeuroFlake — neuro-symbolic LLM flaky classification, 2026.
- **Discerning Flaky from Fault-triggering Failures (Chromium CI)** — [arXiv:2302.10594](https://arxiv.org/pdf/2302.10594).
  The 76%-misclassification result; core evidence for the determinism thesis.

**Test oracle / assertions**
- Barr, Harman, McMinn, Shahbaz, Yoo — The Oracle Problem in Software Testing: A Survey, TSE 2014;
  [eecs481.org/readings/testoracles.pdf](https://eecs481.org/readings/testoracles.pdf).
- "Assertions in software testing: survey, landscape, and trends" — STTT 2025.
- Metamorphic testing — Chen et al.; applied to AI/LLM code: [arXiv:2406.06864](https://arxiv.org/pdf/2406.06864).

**Accessibility as a testing abstraction**
- W3C Accessible Name and Description Computation — [w3.org/TR/accname](https://www.w3.org/TR/accname/).
- W3C WAI-ARIA; Playwright ARIA snapshots — [playwright.dev/docs/aria-snapshots](https://playwright.dev/docs/aria-snapshots).

**Web-agent evaluation (pivot 3.1)**
- WebArena — [arXiv:2307.13854](https://arxiv.org/abs/2307.13854); deterministic, state-based reward.
- WebVoyager — [arXiv:2401.13919](https://arxiv.org/abs/2401.13919); GPT-4V judge, non-deterministic.
- WAREX — [arXiv:2510.03285](https://arxiv.org/pdf/2510.03285); StressWeb — [arXiv:2604.16385](https://arxiv.org/pdf/2604.16385).

**Screen / UI parsing (icon problem, §1.2d)**
- OmniParser / OmniParser V2 — Microsoft; [github.com/microsoft/OmniParser](https://github.com/microsoft/OmniParser),
  [arXiv:2408.00203](https://arxiv.org/abs/2408.00203). YOLO detection + Florence-2 captioning, local weights.

**Structural similarity**
- APTED — Pawlik & Augsten, tree edit distance; [github.com/DatabaseGroup/tree-similarity](https://github.com/DatabaseGroup/tree-similarity).

**Standards**
- W3C WebDriver BiDi — [w3.org/TR/webdriver-bidi](https://www.w3.org/TR/webdriver-bidi/).
- Chrome DevTools Protocol (being superseded by BiDi for cross-browser).

**Visual / layout regression (pivot 3.3)**
- X-PERT, WEBDIFF — cross-browser incompatibility detection.
- Search-based layout XBI repair — [ResearchGate 317300556](https://www.researchgate.net/publication/317300556).
- SSIM — structural similarity index; perceptual diffing.

**Industry landscape (context, not academic)**
- Similo family SOTA claim, cost model — [arXiv:2505.16424](https://www.arxiv.org/pdf/2505.16424).
- Playwright Agents (Planner/Generator/Healer) — [shiplight.ai/blog/playwright-agents](https://www.shiplight.ai/blog/playwright-agents).
- Octomind shutdown (May 2026) — [stackpick.net/tools/octomind](https://stackpick.net/tools/octomind/).
- Meticulous / Momentic / QA Wolf comparison — [kanopylabs.com](https://kanopylabs.com/blog/ai-testing-tools-meticulous-vs-momentic-vs-qa-wolf).
- Vibe-coding QA gap — [bug0.com/blog/vibe-coding-qa-problem](https://bug0.com/blog/vibe-coding-qa-problem).
- Currents (dashboard reference) — [currents.dev](https://currents.dev/playwright).
