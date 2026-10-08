## Healing benchmark

### Tuning apps (1 cases, apps: login)

| system | precision when acting | false-positive rate | abstention rate | recovery rate |
|---|---|---|---|---|
| stored selector | n/a (n/a–n/a) | 0% (0%–0%) | 100% (100%–100%) | 0% (0%–0%) |
| role + name | 100% (100%–100%) | 0% (0%–0%) | 0% (0%–0%) | 100% (100%–100%) |
| Gimbal | 100% (100%–100%) | 0% (0%–0%) | 0% (0%–0%) | 100% (100%–100%) |

Outcomes are per (target, mutation) case; intervals are 95% bootstrap over cases. Median Gimbal run time per case: 12.2s (p95 12.2s, includes browser start).
