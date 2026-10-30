# Tauri desktop companion (Rust MCP + browser sync)

Date: 2026-10-30

## Goal

Add a fast Tauri desktop companion that owns one on-disk Personal OS pack, serves agents over a Rust MCP server (read and write), and lets the existing browser capture app sync notes over localhost. The browser capture desk stays; the zip-only loop is no longer required when the companion is running.

## Decisions locked in brainstorming

| Topic | Choice |
| --- | --- |
| Capture UI | Keep the browser capture app |
| Desktop role | Companion hub, not a replacement desk in this slice |
| Implementation | Full Rust MCP and pack IO inside Tauri (no Node sidecar) |
| Browser ↔ disk | Localhost HTTP API on the companion |
| Offline | Browser keeps working on `localStorage`, syncs when companion returns |
| Agent writes | Apply immediately (no approval queue) |
| Sync conflicts | Last-write-wins by note `updated` timestamp |
| Speed | First-class: in-memory index, no Node on the agent path |

## Non-goals (this slice)

- Embedded terminal / Claude Code CLI / Cursor CLI inside Tauri
- Skills registry create/update and skill execution
- Git auto-commit, remotes, or cross-machine sync
- Human-in-the-loop approval for agent writes
- Replacing or removing `apps/capture`
- Rewriting `@personal-os/pack-core` away from the browser; JS pack-core remains the browser parser

Later work can add terminal, skills, and Git without changing the pack contract.

## Architecture

```text
┌──────────────────────────────┐
│ Capture app (browser)        │
│ localStorage + sync client   │
└──────────────┬───────────────┘
               │ HTTP 127.0.0.1
               ▼
┌──────────────────────────────┐
│ Tauri app (Rust core)        │
│ store (in-memory) + fs + UI  │
├──────────────┬───────────────┤
│ MCP stdio    │ HTTP API      │
└──────┬───────┴───────┬───────┘
       │               │
       ▼               ▼
 Cursor / Claude    pack folder on disk
                    (version 1 Markdown)
```

Browser and Tauri both edit the same pack. Agents and the browser share one Rust `store`. JS `pack-core` continues to parse/serialize in the browser; Rust must emit and accept the same on-disk contract documented in [`docs/pack-format.md`](../../pack-format.md).

### Performance requirements

- Cold start to “MCP ready”: target under ~500ms for a typical pack (hundreds of notes).
- After load, `list` / `search` / `get` use an in-memory note index only.
- Writes update memory and disk; the search index updates incrementally for the touched note.
- HTTP and stdio MCP share one process and one store (no second runtime).
- File watcher coalesces bursts, then reloads only changed paths when something else edits the folder.
- Tauri UI stays thin: pack path, status, sync/health — not a second full capture desk.

## Pack on disk

- User-chosen pack root; default under the home directory, e.g. `~/.personal-os/personal-os/`.
- Layout matches pack format version 1: shelf directories, `.md` notes with current frontmatter, `_meta/manifest.json` rebuilt on write.
- Optional `_meta/shelves.json` for shelf display metadata (name, color, order, default).
- Loader rules match today’s scanner: immediate non-`_meta` shelf directories; immediate `.md` files only; no nested shelves.
- Note `id`, `title`, `shelf`, `tags`, `created`, `updated`, body, and pack-relative `path` stay the contract. New notes use `note_` plus 12 hex characters, same as capture.

## MCP tools

Results stay one MCP text content item whose `text` is JSON, consistent with [`docs/mcp-and-api.md`](../../mcp-and-api.md).

### Existing (keep)

| Tool | Behavior |
| --- | --- |
| `list_shelves` | Sorted shelf names, including empty on-disk shelves |
| `search_context` | Keyword search; optional exact `shelf`; same scoring spirit as today (title / tags / body) |
| `get_note` | Full note by id or relative path, or `null` |
| `reload_pack` | Full re-read from disk into memory |

### New (immediate write)

| Tool | Arguments | Behavior |
| --- | --- | --- |
| `upsert_note` | `{ id?, title, shelf, body, tags? }` | Create when `id` omitted; update when present. Set `updated` to now; ensure shelf directory; write Markdown; refresh memory + manifest. Return full `Note`. |
| `delete_note` | `{ idOrPath }` | Remove file and index entry; update manifest. Return `{ ok: true }` or not-found. |

No skill tools in this slice.

## HTTP API (browser companion)

Bind **`127.0.0.1` only**. Default port **8787** (same as today’s Node HTTP helper); make it configurable in the Tauri UI if busy. No auth in this slice (local trust model).

| Method | Path | Role |
| --- | --- | --- |
| `GET /health` | Companion up; include note count (and pack path if useful) |
| `GET /notes` | All notes; optional `?since=` for incremental sync |
| `GET /notes/:idOrPath` | One note |
| `PUT /notes/:id` | Upsert; LWW uses client-supplied `updated` vs disk |
| `POST /sync` | Batch upsert from browser `localStorage`; per-id LWW by `updated`; response is the authoritative note list (and deleted ids if tracked) |
| `DELETE /notes/:id` | Delete |
| `GET /shelves`, `GET /search` | Optional read parity with the Node HTTP API |

Path traversal outside the pack root is rejected (`..` and absolute escapes).

## Browser sync behavior

1. While companion is unreachable: capture works as today on `localStorage` (and zip export remains available as a backup path).
2. When companion becomes healthy: `POST /sync` with local notes; apply last-write-wins by `updated`; replace local cache with the response.
3. While online: individual saves may `PUT` and still mirror into `localStorage` as a cache.
4. Surface a simple online/offline indicator in capture.

## Rust module layout

Suggested crate modules inside the Tauri app (names can vary; boundaries matter):

| Module | Responsibility |
| --- | --- |
| `pack` | Parse/serialize Markdown + YAML to match pack-format; slug/path helpers aligned with pack-core |
| `store` | In-memory notes + shelves; load; incremental upsert/delete; keyword search |
| `fs` | Atomic writes (temp + rename), manifest rebuild, shelf directories |
| `mcp` | stdio MCP adapter over `store` |
| `http` | Localhost HTTP adapter over `store` |
| `watch` | Debounced filesystem events → partial reload |
| `app` | Tauri: choose pack path, start MCP + HTTP, status UI |

### Concurrency

One shared lock around `store` (e.g. `RwLock`). Reads concurrent; writes exclusive. MCP and HTTP use the same store. Disk writes must not leave the index half-updated relative to a successful tool/HTTP response.

Git locking is out of scope for this slice.

## Error handling

| Situation | Behavior |
| --- | --- |
| Missing or unreadable pack root | Fail startup; clear message in UI and stderr |
| Corrupt single `.md` | Skip file; log; serve the rest |
| Invalid MCP/HTTP payloads | Structured error; no partial write |
| Companion down | Browser stays on `localStorage`; show offline |
| HTTP port in use | Fail visibly; never bind non-loopback |

## Security

- HTTP listens on `127.0.0.1` only.
- No network exposure of the pack.
- Restrict CORS to what local capture / dev origins need.
- All file IO confined to the chosen pack root.

## Testing

- Rust unit tests: parse/serialize round-trip using samples from `fixtures/personal-os`.
- Store tests: upsert, delete, LWW sync, search smoke.
- MCP and HTTP integration tests against a temporary pack directory.
- Capture tests: sync when companion up; offline save (Vitest + mocked fetch).
- Manual check: point Cursor or Claude Code at the companion MCP; `upsert_note`; confirm the note appears in capture after sync.

## Relationship to existing Node `context-mcp`

`apps/context-mcp` remains for the plugin-zip / Node install path until a later migration. The Tauri companion is a parallel agent entry point optimized for speed and writes. Pack format stays the shared contract. Do not fork the Markdown shape.

## Repo placement

- New app: e.g. `apps/desktop` (Tauri + Rust).
- Capture changes stay in `apps/capture` (sync client + online indicator).
- Update product docs (`docs/architecture.md`, `docs/mcp-and-api.md`) when the implementation lands; ask before changing `AGENTS.md` / `docs/agent-kb/`.

## Success criteria

1. Companion starts quickly and serves MCP reads from memory.
2. Agent can create and update a shelf note via MCP; file appears on disk in pack format.
3. Capture edits sync to disk over localhost when companion is up.
4. Capture works offline and converges via LWW sync when companion returns.
5. Fixtures and existing pack files remain readable by both Rust and JS parsers.
