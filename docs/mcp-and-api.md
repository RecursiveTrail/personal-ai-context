# MCP and HTTP API

`@personal-os/context-mcp` is a local, read-only adapter over an unpacked pack. It always starts an MCP server on stdio; `--http` additionally starts the HTTP server in the same process.

## Configuration

| Setting | Meaning |
| --- | --- |
| `--pack /absolute/path/to/personal-os` | Pack directory. Takes precedence over the environment variable. |
| `PERSONAL_OS_PACK_PATH` | Pack directory used when `--pack` is absent. |
| `--http` | Also listen for HTTP requests on `127.0.0.1` only. |
| `PORT` | HTTP port; defaults to `8787`. Must be an integer from 1 through 65535. It has no effect without `--http`. |

Startup fails with a clear message if neither pack setting exists or the directory is unreadable. With `--http`, it also fails if `PORT` is invalid. Relative pack paths resolve from the process working directory; absolute paths are safer in agent configuration.

```sh
npm run build -w @personal-os/pack-core
npm run build -w @personal-os/context-mcp
PERSONAL_OS_PACK_PATH=/ABS/PATH/to/personal-os \
  node apps/context-mcp/dist/server.js --http
```

The pack is loaded once at startup. Restart the process after replacing pack files.

## MCP tools

Tool results contain one MCP text content item. Its `text` is a JSON-encoded value with the shape below.

| Tool | Arguments | Decoded return value | Errors and missing data |
| --- | --- | --- | --- |
| `list_shelves` | none | `string[]`, unique shelf values sorted alphabetically | Normally returns an array, including `[]` for an empty pack. |
| `search_context` | `{ "query": string, "shelf"?: string }` | `SearchHit[]` where each hit is `{ id, title, path, shelf, excerpt, score }` | MCP input validation rejects a missing/non-string query or non-string shelf. No match returns `[]`; MCP does not add the HTTP hint. |
| `get_note` | `{ "idOrPath": string }` | Full `Note` `{ id, title, shelf, tags, created, updated, body, path }`, or `null` | MCP input validation rejects a missing/non-string argument. An unknown ID/path returns `null`, not a tool error. |

`search_context` uses case-insensitive keyword tokens and an optional exact, case-sensitive shelf filter. A blank or whitespace-only query returns all notes in the selected scope with score `0`; a non-blank query containing no searchable tokens returns `[]`. Otherwise title, tag, and content matches are ranked deterministically; excerpts are at most 160 characters.

## HTTP endpoints

The HTTP server binds to `127.0.0.1` only and is not exposed on external network interfaces. All responses use `application/json`. Only `GET` is accepted; any other method returns `405 {"error":"Method not allowed"}`.

| Method and path | Query/identifier | Success | Other status codes |
| --- | --- | --- | --- |
| `GET /health` | none | `200 {"ok":true}` | — |
| `GET /shelves` | none | `200 {"shelves":string[]}` | — |
| `GET /search` | `q` defaults to `""`; optional exact `shelf` | `200 {"hits":SearchHit[]}`; adds `hint` when empty | — |
| `GET /notes/:idOrPath` | URL-encoded note ID or relative path | `200` with a full `Note` | `404 {"error":"Note not found"}` |
| Any unknown path | — | — | `404 {"error":"Not found"}` |

Malformed request values that throw while parsing, such as invalid percent encoding in a note path, return `400 {"error":"..."}`.

```sh
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/shelves
curl -s 'http://127.0.0.1:8787/search?q=concise&shelf=preferences'
curl -s http://127.0.0.1:8787/notes/note_pref_short
curl -s http://127.0.0.1:8787/notes/preferences%2Fprefer-short-answers.md
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
- **Changes do not appear:** browser storage and the disk pack are separate. Download a new zip, replace the extracted directory, and restart the MCP process.
- **A note is absent but others load:** validate its required frontmatter and confirm it is a direct `.md` child of a shelf directory. Corrupt notes are skipped.
- **HTTP does not listen:** include `--http`; `PORT` alone does not enable HTTP.
- **Invalid port:** use an integer from 1 to 65535.
