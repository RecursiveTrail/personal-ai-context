# Personal OS Context MCP

Exposes an unpacked personal context pack through MCP stdio and an optional
read-only HTTP API. The pack is loaded at startup; restart the process after
replacing its files.

## Build and run

From the repository root:

```sh
npm install
npm run build -w @personal-os/pack-core
npm run build -w @personal-os/context-mcp
```

Configure the pack with `--pack` (which takes precedence) or
`PERSONAL_OS_PACK_PATH`:

```sh
node apps/context-mcp/dist/server.js \
  --pack /ABS/PATH/to/personal-os
```

For source development:

```sh
npm run dev -w @personal-os/context-mcp -- \
  --pack ./fixtures/personal-os
```

The MCP server exposes:

- `list_shelves`
- `search_context` with `query` and optional `shelf`
- `get_note` with `idOrPath`

## Cursor MCP configuration

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

## Optional HTTP API

Pass `--http` to also start the HTTP API. It listens on `127.0.0.1` only;
`PORT` defaults to `8787`.

```sh
PERSONAL_OS_PACK_PATH=/ABS/PATH/to/personal-os \
  node apps/context-mcp/dist/server.js --http

curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/shelves
curl -s 'http://127.0.0.1:8787/search?q=concise&shelf=preferences'
curl -s http://127.0.0.1:8787/notes/note_pref_short
```

Endpoints:

- `GET /health`
- `GET /shelves`
- `GET /search?q=&shelf=`
- `GET /notes/:idOrPath`

The configured path must be the `personal-os/` directory containing the shelf
folders, not the downloaded zip or its parent. For exact return shapes, status
codes, validation behavior, corrupt-file handling, and troubleshooting, see
the full [MCP and HTTP API reference](../../docs/mcp-and-api.md).
