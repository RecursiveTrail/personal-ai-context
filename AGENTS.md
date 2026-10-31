# AGENTS.md — Personal Context OS

Personal Context OS captures preferences, routines, goals, and AI collaboration guidance as a portable Markdown pack. Agents query that pack over MCP or HTTP. Version 1 is local-only: the capture app stores notes in the browser until the user downloads `personal-os-plugin.zip`. That zip is a local plugin for Claude Code, Cursor, and Codex / ChatGPT desktop. The context server is inside it and reads `plugin/personal-os/`. Import merges that zip, or an older pack-only zip, back into the browser after a summary. Optionally, `apps/desktop` is a Tauri companion that owns an on-disk pack, serves write-capable Rust MCP (`personal-os-mcp`), and syncs with capture over localhost.

## Read order

1. This file
2. [`docs/agent-kb/`](docs/agent-kb/README.md) for agent-facing guidance
3. Existing product docs under [`docs/`](docs/) when you need contracts or deep detail

Do not treat this file or `docs/agent-kb/` as a second source of truth for pack format, MCP/HTTP, or architecture — link to and update the canonical docs instead.

## Repository map

| Path | Role |
|------|------|
| [`packages/pack-core`](packages/pack-core/README.md) | Shared pack types, parse/serialize, manifest, search, Node loader |
| [`apps/capture`](apps/capture/README.md) | React/Vite capture UI, `localStorage`, plugin zip export and import |
| [`apps/context-mcp`](apps/context-mcp/README.md) | stdio MCP server + optional read-only HTTP API; also bundled into the plugin zip |
| [`apps/desktop`](apps/desktop/README.md) | Tauri companion: on-disk pack, localhost sync HTTP, Rust `personal-os-mcp` (read/write) |
| [`fixtures/personal-os`](fixtures/personal-os) | Version 1 example pack used by tests |

## Essential commands

```sh
npm install
npm test
npm run build
npm run build:desktop

npm run dev -w @personal-os/capture
npm run dev -w @personal-os/context-mcp -- --pack ./fixtures/personal-os
npm run tauri:dev -w @personal-os/desktop
```

Node.js 20+ (desktop also needs Rust and [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)). Prefer workspace-scoped commands (`-w @personal-os/...`) for focused work. See [`docs/development.md`](docs/development.md).

## Hard rules

- **Local-first V1:** no accounts, hosted note storage, Drive sync, embeddings/semantic search, or automatic pack refresh unless the user explicitly expands scope.
- **Pack format is the contract** between capture and server. Change it via TDD in `pack-core`, then fixtures, then consumers. Canonical spec: [`docs/pack-format.md`](docs/pack-format.md).
- Keep `@personal-os/pack-core` browser-safe; parsing/`node:*` stay behind `/parse` and `/node` entry points.
- Put shared server behavior in `packService.ts`; keep MCP and HTTP adapters thin.

## Doc hygiene (required)

After **substantive** work (features, APIs, pack format, architecture, or agent workflows), **ask** whether to update `AGENTS.md` and/or `docs/agent-kb/`.

- Do **not** update those files silently.
- Propose a short list of what would change, then wait for yes/no.
- Details: [`docs/agent-kb/keeping-docs-current.md`](docs/agent-kb/keeping-docs-current.md)

## Canonical docs

- [Architecture](docs/architecture.md)
- [Pack format](docs/pack-format.md)
- [MCP and HTTP API](docs/mcp-and-api.md)
- [Development](docs/development.md)
- [Design spec](docs/superpowers/specs/2026-09-04-personal-context-os-design.md)
- [Plugin bundle design](docs/superpowers/specs/2026-10-21-plugin-bundle-design.md)
- [Changelog](CHANGELOG.md)
