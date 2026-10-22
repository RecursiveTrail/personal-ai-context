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

Owns browser interaction and local persistence. The capture desk provides a shelves hub, shelf detail views, a ledger index, and an audio capture page. It captures typed, pasted, or browser-transcribed text, and it can extract selectable text from a text-layer PDF into the note field without storing the PDF. Notes live under `personal-os.notes.v1`; shelf description/color metadata lives under `personal-os.shelves.v1` and is not written into the pack notes. Download pack saves `personal-os-plugin.zip`; unzip it, and the inner `plugin/personal-os` directory is the pack. The install guide and `INSTALL.md` explain Claude Code, Cursor, and Codex / ChatGPT desktop. Import plugin merges that zip, or an older `personal-os.zip`, after a summary. Optional shelf metadata is exported as `_meta/shelves.json`. Import parses notes in the browser, so the capture app sets `globalThis.Buffer` before loading the parser. It has no account, backend, upload, or automatic synchronization.

### `apps/context-mcp`

Loads an unpacked pack at process startup and exposes read-only access. `packService.ts` is the application boundary; `mcpTools.ts` adapts it to MCP stdio and `httpApi.ts` adapts it to JSON over HTTP. Shelf listing includes empty on-disk shelf directories. `reload_pack` and `POST /reload` re-read the pack after the user replaces exported files.

### `fixtures/personal-os`

Provides a complete, known pack for parser, service, MCP, and HTTP tests. Update it whenever a contract or default-shelf change needs representative data.

## Why files are the contract

The capture and server do not share a database or runtime. Their compatibility depends only on the [pack format](pack-format.md), so either side can evolve independently and hand-maintained packs remain possible.

Future Drive sync should transport or reconcile these same files rather than introduce a private database-shaped contract. A sync implementation must preserve relative paths, stable IDs, frontmatter, Markdown bodies, and manifest version semantics. The local loader currently discovers notes by scanning shelf directories; it does not consume the manifest.

## Data flows

### Capture and save

1. Quick capture on a shelf collects body text; the first line becomes the title. SpeechRecognition, clipboard paste, or PDF text extraction may populate the body; the user can edit it.
2. `saveNote` creates `note_<12 hex characters>` with `crypto.randomUUID`, ISO `created`/`updated` timestamps, a slug-derived path, and optional `capture:*` provenance tags.
3. A `-2`, `-3`, and so on suffix resolves path collisions.
4. The complete `Note[]` is written to browser `localStorage` under `personal-os.notes.v1`.
5. Export serializes each note to its relative path and generates `_meta/manifest.json` inside the `plugin/personal-os/` directory of `personal-os-plugin.zip`.

### `search_context`

1. Server startup resolves `--pack`, then `PERSONAL_OS_PACK_PATH`, then a sibling `personal-os/` directory beside the server file. It scans immediate shelf directories and parses their `.md` files.
2. The MCP SDK validates `query` and optional `shelf`.
3. `packService.searchContext` calls `searchNotes`.
4. Search applies an exact shelf filter, tokenizes the query, and scores each matching token: title `+3`, matching tag `+2`, and combined title/tags/body `+1`.
5. Hits are sorted by descending score, then title, and returned as JSON text with a body excerpt of at most 160 characters.

## Boundaries and deferred work

Version 1 deliberately excludes accounts, hosted or server-side note storage, cloud/Drive sync, native mobile apps, embeddings or semantic search, automatic shelf classification, and filesystem watchers for exported packs. Manual reload after export is supported. Offline service-worker support is not part of the shipped capture shell.

See the design specification's [non-goals](superpowers/specs/2026-09-04-personal-context-os-design.md#non-goals-v1), [future work](superpowers/specs/2026-09-04-personal-context-os-design.md#future-work-explicitly-deferred), and [decision log](superpowers/specs/2026-09-04-personal-context-os-design.md#decision-log).
