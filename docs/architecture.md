# Architecture

Personal Context OS joins a browser capture app to agents through a version 1 Markdown pack. Two agent paths run in parallel and read the same file layout.

```text
┌──────────────────────────────────────────┐
│ Capture app (browser)                    │
│ localStorage + sync client               │
└─────────────┬──────────────────┬─────────┘
              │ download zip     │ POST /sync when companion is up
              ▼                  ▼
┌─────────────────────────┐  ┌──────────────────────────────┐
│ personal-os/ pack       │  │ Tauri companion (Rust)       │
│ inside the plugin zip   │  │ in-memory store + disk pack  │
└────────────┬────────────┘  │ HTTP 127.0.0.1:8787          │
             │ configured    │ watcher reloads disk edits   │
             ▼ path          └──────────────┬───────────────┘
┌─────────────────────────┐                 │ same pack directory
│ Context server (Node)   │                 ▼
│ MCP stdio + optional    │  ┌──────────────────────────────┐
│ read-only HTTP          │  │ personal-os-mcp (stdio)      │
└────────────┬────────────┘  │ separate process, own index  │
             │               └──────────────┬───────────────┘
             └───────────────┬──────────────┘
                             │ list / search / get
                             │ companion also upserts and deletes
                             ▼
              ┌──────────────────────────────┐
              │ Cursor or another agent      │
              └──────────────────────────────┘
```

## Components and responsibilities

### `packages/pack-core`

Owns the shared contract: note and manifest types, default shelf constants, Markdown parse/serialize functions, filename slugging, ID creation, manifest generation, and deterministic keyword search. Its `@personal-os/pack-core` entry point is browser-safe and excludes `gray-matter`; Markdown parsing is available from `@personal-os/pack-core/parse`. Its `@personal-os/pack-core/node` entry point additionally exposes parsing, filesystem loading, and shelf discovery.

### `apps/capture`

Owns browser interaction and local persistence. The capture desk provides a shelves hub, shelf detail views, a ledger index, and an audio capture page. It captures typed, pasted, or browser-transcribed text, and it can extract selectable text from a text-layer PDF into the note field without storing the PDF. Notes live under `personal-os.notes.v1`; shelf description/color metadata lives under `personal-os.shelves.v1` and is not written into the pack notes. Download pack saves `personal-os-plugin.zip`; unzip it, and the inner `plugin/personal-os` directory is the pack. The install guide and `INSTALL.md` explain Claude Code, Cursor, and Codex / ChatGPT desktop. Import plugin merges that zip, or an older `personal-os.zip`, after a summary. Optional shelf metadata is exported as `_meta/shelves.json`. Import parses notes in the browser, so the capture app sets `globalThis.Buffer` before loading the parser. It has no account, backend, or upload. Notes stay in this browser until zip export, and they also sync to the desktop companion over localhost when that process is up.

### `apps/context-mcp`

Loads an unpacked pack at process startup and exposes read-only access. `packService.ts` is the application boundary; `mcpTools.ts` adapts it to MCP stdio and `httpApi.ts` adapts it to JSON over HTTP. Shelf listing includes empty on-disk shelf directories. `reload_pack` and `POST /reload` re-read the pack after the user replaces exported files. This remains the plugin-zip install path.

### `apps/desktop`

Owns a local pack for the Tauri companion. The window is a status host: pack path, note count, and the health URL. On launch it uses `~/.personal-os/personal-os`, creating that directory and the default shelf folders when they are missing. The Rust core keeps an in-memory note index, writes Markdown atomically, rebuilds `_meta/manifest.json`, and serves HTTP on `127.0.0.1:8787`. A filesystem watcher waits 250ms after a burst of changes, then reloads the pack. Agents use the separate `personal-os-mcp` binary so the GUI process keeps its own stdio; give that binary `--pack` pointed at the same directory. It loads its own index. After the browser or another process writes the pack, call `reload_pack` in the MCP process. Reads after load use memory. A cold start for a few hundred notes is intended to land around half a second; `cargo test` checks behavior and does not record timings.

### `fixtures/personal-os`

Provides a complete, known pack for parser, service, MCP, and HTTP tests. Update it whenever a contract or default-shelf change needs representative data.

## Why files are the contract

Capture, the Node server, and the Rust companion do not share a database. Their compatibility depends only on the [pack format](pack-format.md), so each side can evolve independently and hand-maintained packs remain possible. The companion writes that same layout.

Future Drive sync should transport or reconcile these same files rather than introduce a private database-shaped contract. A sync implementation must preserve relative paths, stable IDs, frontmatter, Markdown bodies, and manifest version semantics. The local loader currently discovers notes by scanning shelf directories; it does not consume the manifest.

## Data flows

### Capture and save

1. Quick capture on a shelf collects body text; the first line becomes the title. SpeechRecognition, clipboard paste, or PDF text extraction may populate the body; the user can edit it.
2. `saveNote` creates `note_<12 hex characters>` with `crypto.randomUUID`, ISO `created`/`updated` timestamps, a slug-derived path, and optional `capture:*` provenance tags.
3. A `-2`, `-3`, and so on suffix resolves path collisions.
4. The complete `Note[]` is written to browser `localStorage` under `personal-os.notes.v1`.
5. Export serializes each note to its relative path and generates `_meta/manifest.json` inside the `plugin/personal-os/` directory of `personal-os-plugin.zip`.

### Companion sync

1. While `http://127.0.0.1:8787/health` is unreachable, capture keeps working on `localStorage`. Zip export remains available.
2. A save writes the note to `localStorage`. The companion receives it on the next mount or window-focus `POST /sync`.
3. That request sends the local notes. Each id uses last-write-wins on `updated`: an incoming timestamp greater than or equal to the server timestamp replaces the server note. The response note list replaces the browser cache. Notes that exist only on the server stay.
4. Capture sends a best-effort `DELETE /notes/:id` when a note is deleted while the companion is up. A delete made while offline is not inferred from a missing id; delete it with `DELETE /notes/:id` or MCP `delete_note` once the companion is up.
5. The Tauri process reloads when files change under its pack. `personal-os-mcp` sees those edits after `reload_pack`.

### `search_context`

1. Server startup resolves `--pack`, then `PERSONAL_OS_PACK_PATH`, then a sibling `personal-os/` directory beside the server file. It scans immediate shelf directories and parses their `.md` files.
2. The MCP SDK validates `query` and optional `shelf`.
3. `packService.searchContext` calls `searchNotes`.
4. Search applies an exact shelf filter, tokenizes the query, and scores each matching token: title `+3`, matching tag `+2`, and combined title/tags/body `+1`.
5. Hits are sorted by descending score, then title, and returned as JSON text with a body excerpt of at most 160 characters.

## Boundaries and deferred work

Version 1 excludes accounts, hosted or server-side note storage, cloud/Drive sync, native mobile apps, embeddings or semantic search, and automatic shelf classification. The zip and Node path re-reads an unpacked pack through `reload_pack` or `POST /reload`. The desktop companion is a parallel local path: it watches its own pack, and capture syncs to it over localhost. Offline service-worker support is not part of the shipped capture shell. Terminal, skills, and Git stay later work.

See the design specification's [non-goals](superpowers/specs/2026-09-04-personal-context-os-design.md#non-goals-v1), [future work](superpowers/specs/2026-09-04-personal-context-os-design.md#future-work-explicitly-deferred), and [decision log](superpowers/specs/2026-09-04-personal-context-os-design.md#decision-log).
