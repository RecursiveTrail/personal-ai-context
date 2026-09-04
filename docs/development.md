# Development

## Prerequisites and setup

Use Node.js 20 or newer. From the repository root:

```sh
npm install
npm test
npm run build
```

`npm install` runs pack-core's `prepare` script and creates its `dist/` output.
If dependencies are already installed but `packages/pack-core/dist` is absent,
run `npm run build -w @personal-os/pack-core` before root tests or dependent
workspace commands.

The root scripts run each workspace's matching script:

- `npm test` — all workspace Vitest suites.
- `npm run build` — TypeScript/package build for pack-core and context-mcp, plus the capture production build.

Run one workspace at a time:

```sh
npm test -w @personal-os/pack-core
npm test -w @personal-os/capture
npm test -w @personal-os/context-mcp

npm run build -w @personal-os/pack-core
npm run build -w @personal-os/capture
npm run build -w @personal-os/context-mcp
```

Pass a Vitest file pattern after `--` for a narrower run:

```sh
npm test -w @personal-os/pack-core -- src/search.test.ts
npm test -w @personal-os/context-mcp -- src/httpApi.test.ts
```

Start development processes with:

```sh
npm run dev -w @personal-os/capture
npm run dev -w @personal-os/context-mcp -- --pack ./fixtures/personal-os
```

## Change the pack contract with TDD

`pack-core` is consumed by both browser and Node code, so contract changes start with a failing focused test. Add or update representative tests for types, parsing/serialization, manifest generation, search, or loading; verify the failure; make the smallest implementation change; then run pack-core and all workspace tests.

Keep `src/index.ts` browser-safe. Markdown parsing through `gray-matter` belongs behind `@personal-os/pack-core/parse`, while files that import `node:*` belong behind `src/node.ts` and the `@personal-os/pack-core/node` export. For a format change, update fixtures and [pack-format.md](pack-format.md), and state backward-compatibility impact in the changelog.

## Add a default shelf

Custom disk shelves need no code change, but a shelf offered by the capture UI is a product default:

1. Add its slug to `DEFAULT_SHELVES` in `packages/pack-core/src/types.ts`.
2. Update the constants test. `CaptureForm` and `NoteLibrary` consume the constant, so confirm both create and edit selectors display it.
3. Add an atomic example note under the matching `fixtures/personal-os/<shelf>/` directory.
4. Add the matching fixture entry to `_meta/manifest.json` and extend loader/service tests where useful.
5. Update [pack-format.md](pack-format.md), root/user-facing documentation, and the changelog.
6. Run `npm test` and `npm run build`.

Shelf slugs should be lowercase and filesystem-safe. The frontmatter `shelf`, parent directory, note path, and manifest entry must agree.

## Add an MCP operation

Keep transports thin and put shared behavior in the service:

1. Add the operation to `apps/context-mcp/src/packService.ts`, with a service-level test.
2. Register its MCP name, Zod input schema, read-only annotations, and JSON text result in `mcpTools.ts`; extend `mcpTools.test.ts`.
3. If HTTP parity is intended, add the route and JSON/status behavior in `httpApi.ts`; extend `httpApi.test.ts`.
4. Update [mcp-and-api.md](mcp-and-api.md) and `apps/context-mcp/README.md`, including missing-data and validation behavior.
5. Run the context-mcp focused tests, then `npm test` and `npm run build`.

Avoid transport-specific business logic. If an operation changes pack semantics, update and test pack-core first.

## Release checklist

- All workspace tests pass with `npm test`.
- All workspaces build with `npm run build`.
- `[Unreleased]` in `CHANGELOG.md` describes user-visible and contract changes.
- Pack-format compatibility is explicitly recorded: no change, backward-compatible version 1 addition, or breaking version bump/migration.
- Fixture packs and examples match the shipped parser, serializer, and manifest.
- MCP names, arguments, HTTP routes, environment variables, and Cursor configuration are verified against source.
- Manual capture → export → unpack → MCP search succeeds when behavior changed across that boundary.

## Design history

The approved [design specification](superpowers/specs/2026-09-04-personal-context-os-design.md) explains product boundaries and decisions. The [implementation plan](superpowers/plans/2026-09-04-personal-context-os.md) records the task-by-task build. Treat shipped code and current contract documentation as authoritative when historical plan snippets differ.
