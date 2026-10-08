## Healing benchmark

### Tuning apps (7 cases, apps: login)

| system | precision when acting | false-positive rate | abstention rate | recovery rate |
|---|---|---|---|---|
| stored selector | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | 0% (0%–0%) |
| role + name | 100% (100%–100%) | 0% (0%–0%) | 57% (29%–86%) | 60% (17%–100%) |
| Gimbal | 100% (100%–100%) | 0% (0%–0%) | 57% (14%–86%) | 60% (17%–100%) |

Outcomes are per (target, mutation) case; intervals are 95% bootstrap over cases. Median Gimbal run time per case: 14.1s (p95 14.6s, includes browser start).
