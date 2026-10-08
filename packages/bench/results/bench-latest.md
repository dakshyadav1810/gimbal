## Healing benchmark

### Tuning apps (63 cases, apps: login, checkout, table)

| system | precision when acting | false-positive rate | abstention rate | recovery rate |
|---|---|---|---|---|
| stored selector | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | 0% (0%–0%) |
| role + name | 100% (100%–100%) | 0% (0%–0%) | 57% (46%–68%) | 60% (46%–74%) |
| Gimbal | 100% (100%–100%) | 0% (0%–0%) | 56% (44%–68%) | 62% (49%–76%) |

### Held-out apps (91 cases, apps: toolbar, modal, nav, settings)

| system | precision when acting | false-positive rate | abstention rate | recovery rate |
|---|---|---|---|---|
| stored selector | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | 0% (0%–0%) |
| role + name | 98% (92%–100%) | 1% (0%–3%) | 55% (45%–66%) | 62% (49%–73%) |
| Gimbal | 100% (100%–100%) | 0% (0%–0%) | 55% (45%–65%) | 63% (51%–75%) |

Outcomes are per (target, mutation) case; intervals are 95% bootstrap over cases. Median Gimbal run time per case: 14.1s (p95 14.6s, includes browser start).
