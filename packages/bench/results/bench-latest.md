## Healing benchmark

### Tuning apps (9 cases, apps: login, checkout, table)

| system | precision when acting | false-positive rate | abstention rate | recovery rate |
|---|---|---|---|---|
| stored selector | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | n/a (n/a–n/a) |
| role + name | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | n/a (n/a–n/a) |
| Gimbal | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | n/a (n/a–n/a) |

### Held-out apps (13 cases, apps: toolbar, nav, modal, settings)

| system | precision when acting | false-positive rate | abstention rate | recovery rate |
|---|---|---|---|---|
| stored selector | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | n/a (n/a–n/a) |
| role + name | 0% (0%–0%) | 8% (0%–23%) | 92% (77%–100%) | n/a (n/a–n/a) |
| Gimbal | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | n/a (n/a–n/a) |

Outcomes are per (target, mutation) case; intervals are 95% bootstrap over cases. Median Gimbal run time per case: 14.6s (p95 14.6s, includes browser start).
