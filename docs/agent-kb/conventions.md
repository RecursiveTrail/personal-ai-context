# Conventions

## Workspaces and commands

- Monorepo via npm workspaces: `packages/*`, `apps/*`
- Prefer scoped runs: `npm test -w @personal-os/pack-core`, etc.
- Narrow Vitest with `--`: `npm test -w @personal-os/pack-core -- src/search.test.ts`
- If `packages/pack-core/dist` is missing after install, build pack-core before dependent workspaces

## pack-core entry points

| Import | Use for |
|--------|---------|
| `@personal-os/pack-core` | Browser-safe types, serialize, search, manifest helpers — no `gray-matter` |
| `@personal-os/pack-core/parse` | Markdown parse (gray-matter) |
| `@personal-os/pack-core/node` | Filesystem load, shelf discovery, Node-only APIs |

Do not pull Node or gray-matter into the browser entry.

## Tests and fixtures

- Contract changes: failing test first, then implementation
- Keep `fixtures/personal-os` representative of the shipped format; shelf directory, frontmatter `shelf`, note path, and manifest entry must agree
- Service tests for shared MCP/HTTP behavior; transport tests stay thin

## Documentation

- Product contracts: edit `docs/architecture.md`, `docs/pack-format.md`, `docs/mcp-and-api.md`, `docs/development.md` — do not duplicate them wholesale into agent-kb
- User-visible or contract changes: update `[Unreleased]` in `CHANGELOG.md`
- Release bar: [`docs/development.md` release checklist](../development.md#release-checklist)

## Code style

Match surrounding packages: existing TypeScript patterns, Vitest, and README tone. Prefer small, focused diffs over drive-by refactors.
