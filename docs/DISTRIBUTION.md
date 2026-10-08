# Distribution

Gimbal is distributed as three npm packages:

| Package | Purpose |
|---|---|
| `gimbal` | Public CLI and MCP entry point |
| `@gimbal/core` | Fastify server, resolver, execution engine, and bundled dashboard |
| `@gimbal/shared` | Shared Zod schemas and TypeScript types |

The dashboard is built into `@gimbal/core`; it is not published as a standalone
application. The root package is private and exists only to manage the
workspace.

## Local release check

Build and inspect the packages before publishing:

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @gimbal/shared pack --pack-destination /tmp/gimbal-pack
pnpm --filter @gimbal/core pack --pack-destination /tmp/gimbal-pack
pnpm --filter gimbal pack --pack-destination /tmp/gimbal-pack
```

The CLI tarball must contain `dist/`, `README.md`, and `package.json`. The core
tarball must contain `dist/` and the generated `static/` dashboard assets.
Install the tarballs in a clean temporary project if you need to test a release
candidate without publishing it.

## First publication

Create or verify an npm account, then authenticate:

```bash
npm login
npm whoami
```

The scoped packages are configured for public access. Publish dependencies
before the CLI:

```bash
pnpm --filter @gimbal/shared publish --access public
pnpm --filter @gimbal/core publish --access public
pnpm --filter gimbal publish --access public
```

`pnpm` replaces the workspace dependency ranges with the released package
versions when packing. Keep the three package versions aligned for the first
release.

After publication, verify the public install path:

```bash
npx gimbal@0.1.0 --help
npx gimbal@0.1.0 init
```

For subsequent releases, update the versions together, run the local release
check, and publish the shared package, core, and CLI in that order. Do not
publish from a dirty worktree.

## GitHub release checklist

1. Run `pnpm build`, `pnpm test`, and the relevant TypeScript checks.
2. Review `pnpm pack:cli` output and inspect all package tarballs.
3. Create a versioned Git tag matching the npm version, for example `v0.1.0`.
4. Push the tag and create GitHub release notes.
5. Publish the packages from the tagged commit.

The repository is currently pre-release. Publishing the first package is a
separate action from this repository cleanup and should happen only after the
package name, license, and release version have been confirmed.
