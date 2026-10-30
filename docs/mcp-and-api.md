# MCP and HTTP API

`@personal-os/context-mcp` is a local, read-only adapter over an unpacked pack. It always starts an MCP server on stdio; `--http` additionally starts the HTTP server in the same process.

## Configuration

| Setting | Meaning |
| --- | --- |
| `--pack /absolute/path/to/personal-os` | Pack directory. Takes precedence over the environment variable and the sibling folder. |
| `PERSONAL_OS_PACK_PATH` | Pack directory used when `--pack` is absent. |
| Sibling `personal-os/` | Used when neither of the above is set and `../personal-os` exists beside the server file. The plugin zip places the pack there. |
| `--http` | Also listen for HTTP requests on `127.0.0.1` only. |
| `PORT` | HTTP port; defaults to `8787`. Must be an integer from 1 through 65535. It has no effect without `--http`. |

Startup fails with a clear message if no pack path is set, the sibling folder is absent, or the directory is unreadable. With `--http`, it also fails if `PORT` is invalid. Relative pack paths resolve from the process working directory; absolute paths are safer in agent configuration.

```sh
npm run build -w @personal-os/pack-core
npm run build -w @personal-os/context-mcp
PERSONAL_OS_PACK_PATH=/ABS/PATH/to/personal-os \
  node apps/context-mcp/dist/server.js --http
```

The pack is loaded at startup. After replacing pack files, call `reload_pack` or `POST /reload`, or restart the process.

## MCP tools

Tool results contain one MCP text content item. Its `text` is a JSON-encoded value with the shape below.

| Tool | Arguments | Decoded return value | Errors and missing data |
| --- | --- | --- | --- |
| `list_shelves` | none | `string[]`, unique shelf values sorted alphabetically, including empty on-disk shelf folders | Normally returns an array, including `[]` for an empty pack. |
| `search_context` | `{ "query": string, "shelf"?: string }` | `SearchHit[]` where each hit is `{ id, title, path, shelf, excerpt, score }` | MCP input validation rejects a missing/non-string query or non-string shelf. No match returns `[]`; MCP does not add the HTTP hint. |
| `get_note` | `{ "idOrPath": string }` | Full `Note` `{ id, title, shelf, tags, created, updated, body, path }`, or `null` | MCP input validation rejects a missing/non-string argument. An unknown ID/path returns `null`, not a tool error. |
| `reload_pack` | none | `{ "ok": true, "notes": number, "shelves": string[] }` after re-reading the pack from disk | Reload failures surface as tool errors. |

`search_context` uses case-insensitive keyword tokens and an optional exact, case-sensitive shelf filter. A blank or whitespace-only query returns all notes in the selected scope with score `0`; a non-blank query containing no searchable tokens returns `[]`. Otherwise title, tag, and content matches are ranked deterministically; excerpts are at most 160 characters.

Capture may store `capture:text`, `capture:voice`, `capture:pdf`, or `capture:clipboard` in `tags`. Treat these as provenance, not user preferences.

## HTTP endpoints

The HTTP server binds to `127.0.0.1` only and is not exposed on external network interfaces. All responses use `application/json`. Endpoints accept `GET`, except `POST /reload`. Any other method returns `405 {"error":"Method not allowed"}`.

| Method and path | Query/identifier | Success | Other status codes |
| --- | --- | --- | --- |
| `GET /health` | none | `200 {"ok":true}` | — |
| `GET /shelves` | none | `200 {"shelves":string[]}` including empty shelf directories | — |
| `GET /search` | `q` defaults to `""`; optional exact `shelf` | `200 {"hits":SearchHit[]}`; adds `hint` when empty | — |
| `GET /notes/:idOrPath` | URL-encoded note ID or relative path | `200` with a full `Note` | `404 {"error":"Note not found"}` |
| `POST /reload` | none | `200 {"ok":true,"notes":number,"shelves":string[]}` | — |
| Any unknown path | — | — | `404 {"error":"Not found"}` |

Malformed request values that throw while parsing, such as invalid percent encoding in a note path, return `400 {"error":"..."}`.

```sh
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/shelves
curl -s 'http://127.0.0.1:8787/search?q=concise&shelf=preferences'
curl -s http://127.0.0.1:8787/notes/note_pref_short
curl -s http://127.0.0.1:8787/notes/preferences%2Fprefer-short-answers.md
curl -s -X POST http://127.0.0.1:8787/reload
```

When HTTP search finds no notes, it returns:

```json
{
  "hits": [],
  "hint": "Broaden query or drop shelf filter"
}
```

## Corrupt files

The loader catches errors for individual `.md` files and shelf directories, skips them, and continues serving valid files. Each load error is logged to stderr during startup. A missing or unreadable pack root is different: it fails server startup.

## Cursor configuration

Build first, then use absolute paths:

```json
{
  "mcpServers": {
    "personal-os": {
      "command": "node",
      "args": [
        "/ABS/PATH/to/personal-context-os/apps/context-mcp/dist/server.js",
        "--pack",
        "/ABS/PATH/to/personal-os"
      ]
    }
  }
}
```

`--http` is unnecessary for MCP use. Add it only if the same process should also provide HTTP, and remember that diagnostic output goes to stderr so stdout remains available for MCP.

## Troubleshooting

- **No shelves or notes:** point at the extracted `personal-os/` directory containing `preferences/`, other shelves, and `_meta/`—not its parent and not the zip file.
- **Startup says to set a pack path:** provide `--pack` followed by a value or set `PERSONAL_OS_PACK_PATH`.
- **Changes do not appear:** browser storage and the disk pack are separate. Download a new zip, replace the extracted directory, then call `reload_pack` or `POST /reload` (restarting the process still works).
- **A note is absent but others load:** validate its required frontmatter and confirm it is a direct `.md` child of a shelf directory. Corrupt notes are skipped.
- **HTTP does not listen:** include `--http`; `PORT` alone does not enable HTTP.
- **Invalid port:** use an integer from 1 to 65535.

## Desktop companion

`@personal-os/desktop` is a parallel entry point to the Node server above. The Tauri window hosts the pack, an in-memory index, and HTTP on `127.0.0.1:8787`. Agents launch the separate `personal-os-mcp` binary for stdio MCP. The GUI process keeps its own stdio. Both processes can use one pack directory; each holds its own index.

The app’s default pack is `~/.personal-os/personal-os` (`%USERPROFILE%\.personal-os\personal-os` on Windows). Launch creates that directory and the default shelf folders when they are missing. `personal-os-mcp` requires `--pack` and does not fall back to that directory on its own.

Tool results match the Node server: one MCP text content item whose `text` is JSON. `list_shelves`, `search_context`, `get_note`, and `reload_pack` use the same arguments and decoded shapes as the tables above. `reload_pack` in this process re-reads disk into the MCP index after the browser, the Tauri watcher, or another writer changes files.

| Tool | Arguments | Decoded return value | Errors and missing data |
| --- | --- | --- | --- |
| `upsert_note` | `{ "id"?: string, "title": string, "shelf": string, "body": string, "tags"?: string[] }` | Full `Note`. Omit `id` to create (`note_` plus 12 hex characters). `updated` is stamped to the current UTC time. The shelf directory is created if needed, the Markdown file is written, and `_meta/manifest.json` is refreshed. | Invalid shelf or other input failures return a tool error whose text is `{"error":"..."}`. |
| `delete_note` | `{ "idOrPath": string }` | `{ "ok": true }` when the note was removed, or `{ "ok": false, "error": "not_found" }` | IO failures return a tool error whose text is `{"error":"..."}`. A missing note is the `ok: false` object, not a tool error. |

### HTTP sync endpoints

The companion HTTP server binds to `127.0.0.1` only. The Tauri host uses port `8787`. Responses are `application/json`. CORS allows `http` and `https` origins whose host is `localhost` or `127.0.0.1`, with an optional numeric port. There is no auth token; the trust boundary is loopback.

| Method and path | Body or query | Success | Other status codes |
| --- | --- | --- | --- |
| `GET /health` | none | `200 {"ok":true,"notes":number}` | — |
| `GET /notes` | none | `200 {"notes":Note[]}` | — |
| `GET /notes/:idOrPath` | URL-encoded note ID or relative path | `200` with a full `Note` | `404 {"error":"not found"}` |
| `PUT /notes/:id` | `{ "title", "shelf", "body", "tags"?: string[], "updated"?: ISO-8601 }` | `200` with the stored `Note`. When both sides have `updated` and the server timestamp is strictly newer, the server note is returned unchanged. | `400 {"error":"..."}` for an invalid shelf, path, or timestamp |
| `DELETE /notes/:id` | URL-encoded id or relative path | `200 {"ok":true}` | `404 {"error":"not found"}` |
| `POST /sync` | `{ "notes": Note[] }` | `200 {"notes":Note[],"applied":number,"kept_server":number}` | `400 {"error":"..."}` when a note fails validation or its `updated` timestamp does not parse |
| `GET /shelves` | none | `200 {"shelves":string[]}` | — |
| `GET /search` | `q` defaults to `""`; optional exact `shelf` | `200 {"hits":SearchHit[]}`; adds `hint` when empty, same text as the Node API | — |

`POST /sync` compares each incoming note with the server copy of the same id. An incoming `updated` greater than or equal to the server timestamp is written. An older timestamp increments `kept_server` and leaves the server note in place. Notes that exist only on the server remain in the returned list. A note missing from the browser payload is not treated as a delete.

```sh
curl -s http://127.0.0.1:8787/health
curl -s -X POST http://127.0.0.1:8787/sync \
  -H 'content-type: application/json' \
  -d '{"notes":[]}'
```

### Cursor configuration

Build the binary, then point it at the companion pack (or any version 1 directory, including `fixtures/personal-os`):

```sh
cargo build --bin personal-os-mcp --manifest-path apps/desktop/src-tauri/Cargo.toml
```

```json
{
  "mcpServers": {
    "personal-os": {
      "command": "/ABS/PATH/to/apps/desktop/src-tauri/target/debug/personal-os-mcp",
      "args": [
        "--pack",
        "/ABS/PATH/to/.personal-os/personal-os"
      ]
    }
  }
}
```

Diagnostics go to stderr so stdout stays the MCP stream. See [apps/desktop/README.md](../apps/desktop/README.md) for `tauri:dev` and the health check.
