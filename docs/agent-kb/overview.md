# Overview

Personal Context OS has two independently deployable apps joined by a **filesystem pack** contract. Capture writes Markdown notes into `personal-os-plugin.zip`. The context server is bundled in that zip and also runs from this repo. It loads an unpacked `personal-os/` directory and exposes read-only list/search/get over MCP (and optional HTTP).

## Components

| Component | Responsibility |
|-----------|----------------|
| `packages/pack-core` | Note/manifest/shelf-file types, serialize/parse, search, Node filesystem load |
| `apps/capture` | Speech, typing, and text-layer PDF import into the note field; `localStorage`, library edit, plugin zip export and import — no backend sync |
| `apps/context-mcp` | Load pack at startup; MCP stdio + optional HTTP; business logic in `packService.ts`; bundled into the plugin zip |
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
