# Overview

Personal Context OS joins apps with a **filesystem pack** contract. Capture writes Markdown notes into `personal-os-plugin.zip`. The Node context server is bundled in that zip and also runs from this repo (read-only MCP/HTTP). Optionally, **Chit** (`apps/desktop`) is the local consciousness layer and MCP runtime: on-disk pack, write-capable Rust MCP, and localhost sync with the capture browser.

## Components

| Component | Responsibility |
|-----------|----------------|
| `packages/pack-core` | Note/manifest/shelf-file types, serialize/parse, search, Node filesystem load |
| `apps/capture` | Speech, typing, and text-layer PDF import into the note field; `localStorage`, library edit, plugin zip export and import; syncs to Chit when `127.0.0.1:8787` is up |
| `apps/context-mcp` | Load pack at startup; MCP stdio + optional HTTP; business logic in `packService.ts`; bundled into the plugin zip |
| `apps/desktop` (**Chit**) | Tauri companion: on-disk pack, desk UI, MCP write approval, Connect MCP panel, `127.0.0.1:8787` sync HTTP, Rust `personal-os-mcp` read/write |
| `fixtures/personal-os` | Known pack for tests; update when contracts or default shelves change |

## Files are the contract

Capture and server do not share a database. Compatibility depends on [`docs/pack-format.md`](../pack-format.md). Hand-maintained packs are valid. Localhost sync with Chit still moves the same Markdown notes — not a private DB-shaped contract.

## V1 boundaries (non-goals)

Do not add unless the user explicitly expands scope:

- Accounts, hosted/server-side note storage
- Cloud/Drive sync (localhost Chit sync is in scope; see [workflows](workflows.md#capture--chit-sync))
- Native mobile apps
- Embeddings / semantic search
- Auto shelf classification

See architecture non-goals and the design spec decision log for the full list.

## Dig deeper

- [`docs/architecture.md`](../architecture.md) — diagrams, data flows, deferred work
- [`docs/pack-format.md`](../pack-format.md) — shelves, frontmatter, manifest
- [`docs/superpowers/specs/2026-09-04-personal-context-os-design.md`](../superpowers/specs/2026-09-04-personal-context-os-design.md) — product decisions
