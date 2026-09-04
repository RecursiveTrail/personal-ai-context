# Architecture

Personal Context OS has two independently deployable applications joined by a filesystem contract.

```text
┌──────────────────────────────┐
│ Capture app (browser)        │
│ Speech/type → localStorage   │
└──────────────┬───────────────┘
               │ download zip
               ▼
┌──────────────────────────────┐
│ personal-os/ pack            │
│ Markdown notes + manifest    │
└──────────────┬───────────────┘
               │ configured filesystem path
               ▼
┌──────────────────────────────┐
│ Context server (Node)        │
│ MCP stdio + optional HTTP    │
└──────────────┬───────────────┘
               │ list / search / get
               ▼
┌──────────────────────────────┐
│ Cursor or another agent      │
└──────────────────────────────┘
```

## Components and responsibilities

### `packages/pack-core`

Owns the shared contract: note and manifest types, default shelf constants, Markdown parse/serialize functions, filename slugging, ID creation, manifest generation, and deterministic keyword search. Its `@personal-os/pack-core` entry point is browser-safe and excludes `gray-matter`; Markdown parsing is available from `@personal-os/pack-core/parse`. Its `@personal-os/pack-core/node` entry point additionally exposes parsing, filesystem loading, and shelf discovery.

### `apps/capture`

Owns browser interaction and local persistence. It captures typed, pasted, or browser-transcribed text; stores `Note` objects under `personal-os.notes.v1`; groups and edits them in the library; and serializes the current store into `personal-os.zip`. It has no account, backend, upload, or automatic synchronization.

### `apps/context-mcp`

Loads an unpacked pack once at process startup and exposes read-only access. `packService.ts` is the application boundary; `mcpTools.ts` adapts it to MCP stdio and `httpApi.ts` adapts it to JSON over HTTP. A programmatic `reload()` exists on the service, but no shipped MCP tool or HTTP endpoint calls it.

### `fixtures/personal-os`

Provides a complete, known pack for parser, service, MCP, and HTTP tests. Update it whenever a contract or default-shelf change needs representative data.

## Why files are the contract

The capture and server do not share a database or runtime. Their compatibility depends only on the [pack format](pack-format.md), so either side can evolve independently and hand-maintained packs remain possible.

Future Drive sync should transport or reconcile these same files rather than introduce a private database-shaped contract. A sync implementation must preserve relative paths, stable IDs, frontmatter, Markdown bodies, and manifest version semantics. The local loader currently discovers notes by scanning shelf directories; it does not consume the manifest.

## Data flows

### Capture and save

1. `CaptureForm` collects a required title, default shelf, and required body. SpeechRecognition may populate the body; the user can edit it.
2. `saveNote` creates `note_<12 hex characters>` with `crypto.randomUUID`, ISO `created`/`updated` timestamps, and a slug-derived path.
3. A `-2`, `-3`, and so on suffix resolves path collisions.
4. The complete `Note[]` is written to browser `localStorage` under `personal-os.notes.v1`.
5. Export serializes each note to its relative path and generates `_meta/manifest.json` inside a top-level `personal-os/` zip directory.

### `search_context`

1. Server startup resolves `--pack` before `PERSONAL_OS_PACK_PATH`, scans immediate shelf directories, and parses their `.md` files.
2. The MCP SDK validates `query` and optional `shelf`.
3. `packService.searchContext` calls `searchNotes`.
4. Search applies an exact shelf filter, tokenizes the query, and scores each matching token: title `+3`, matching tag `+2`, and combined title/tags/body `+1`.
5. Hits are sorted by descending score, then title, and returned as JSON text with a body excerpt of at most 160 characters.

## Boundaries and deferred work

Version 1 deliberately excludes accounts, hosted or server-side note storage, cloud/Drive sync, native mobile apps, embeddings or semantic search, automatic shelf classification, and automatic refresh of an exported pack. Offline service-worker support is not part of the shipped capture shell.

See the design specification's [non-goals](superpowers/specs/2026-09-04-personal-context-os-design.md#non-goals-v1), [future work](superpowers/specs/2026-09-04-personal-context-os-design.md#future-work-explicitly-deferred), and [decision log](superpowers/specs/2026-09-04-personal-context-os-design.md#decision-log).
