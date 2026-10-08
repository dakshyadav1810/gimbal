# Releasing (maintainers)

Three packages are published together under one version: `@gimbal/shared`, `@gimbal/core`, `gimbal`.

1. `pnpm install --frozen-lockfile && pnpm lint && pnpm build && pnpm test`
2. `pnpm demo:verify` must print `Demo A verified.`
3. `pnpm bench:smoke` runs and prints a table (numbers are published from `pnpm bench`).
4. Bump the version in all three `package.json` files and `CHANGELOG.md`.
5. `npm pack --dry-run` in each package: only `dist`, `static` (core), `skills` (gimbal), `README.md` and `LICENSE` should be listed.
6. Publish in order: shared, core, gimbal, with `--tag alpha --provenance`.
7. In an empty directory: `npx gimbal@alpha --help`, then `init`, `doctor`.

Record the output of `npm audit --omit=dev` for each release here.
