# Overview

Personal Context OS joins apps with a **filesystem pack** contract. Capture writes Markdown notes into `personal-os-plugin.zip`. The Node context server is bundled in that zip and also runs from this repo (read-only MCP/HTTP). Optionally, `apps/desktop` is a Tauri companion over the same pack format with write-capable Rust MCP and localhost sync for the browser.

## Components

| Component | Responsibility |
|-----------|----------------|
| `packages/pack-core` | Note/manifest/shelf-file types, serialize/parse, search, Node filesystem load |
| `apps/capture` | Speech, typing, and text-layer PDF import into the note field; `localStorage`, library edit, plugin zip export and import; syncs to the desktop companion when it is up |
| `apps/context-mcp` | Load pack at startup; MCP stdio + optional HTTP; business logic in `packService.ts`; bundled into the plugin zip |
| `apps/desktop` | Tauri companion: on-disk pack, `127.0.0.1` sync HTTP, Rust `personal-os-mcp` read/write tools |
| `fixtures/personal-os` | Known pack for tests; update when contracts or default shelves change |

## Files are the contract

Capture and server do not share a database. Compatibility depends on [`docs/pack-format.md`](../pack-format.md). Hand-maintained packs are valid. Future sync should transport these same files, not invent a private DB-shaped contract.

## V1 boundaries (non-goals)

Do not add unless the user explicitly expands scope:

- Accounts, hosted/server-side note storage
- Cloud/Drive sync or automatic pack refresh after browser edits
- Native mobile apps
- Embeddings / semantic search
- Auto shelf classification

See architecture non-goals and the design spec decision log for the full list.

## Dig deeper

- [`docs/architecture.md`](../architecture.md) — diagrams, data flows, deferred work
- [`docs/pack-format.md`](../pack-format.md) — shelves, frontmatter, manifest
- [`docs/superpowers/specs/2026-09-04-personal-context-os-design.md`](../superpowers/specs/2026-09-04-personal-context-os-design.md) — product decisions
