# Personal Context OS

Personal Context OS captures personal preferences, routines, goals, and AI collaboration guidance, then exports them as a portable Markdown pack that agents can query over MCP or HTTP. Version 1 is local-only: notes stay in browser `localStorage` until you download a zip, and the server reads only the unpacked files you configure.

Requires Node.js 20 or newer and a current browser.

## Repository map

- [`packages/pack-core`](packages/pack-core/README.md) — shared pack types, Markdown parsing/serialization, manifest generation, search, and the Node filesystem loader.
- [`apps/capture`](apps/capture/README.md) — React/Vite capture app with speech fallback, local persistence, library editing, and zip export.
- [`apps/context-mcp`](apps/context-mcp/README.md) — local stdio MCP server and optional read-only HTTP API.
- [`fixtures/personal-os`](fixtures/personal-os) — version 1 example pack used by automated tests.

## Quickstart

Install dependencies and start the capture app:

```sh
npm install
npm run dev -w @personal-os/capture
```

Open the printed Vite URL, save notes, and choose **Download pack**. Unzip `personal-os.zip`; the MCP path must be the extracted `personal-os/` directory itself, which contains the shelf directories and `_meta/`.

Build the server and point `--pack` at that absolute path:

```sh
npm run build -w @personal-os/pack-core
npm run build -w @personal-os/context-mcp
node apps/context-mcp/dist/server.js --pack /ABS/PATH/to/personal-os
```

Configure Cursor with the same server and pack:

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

Restart or reload the MCP client after changing its configuration. Re-export and replace the unpacked folder when browser notes change; version 1 does not synchronize it automatically.

## Documentation

- [Architecture](docs/architecture.md)
- [Pack format](docs/pack-format.md)
- [MCP and HTTP API](docs/mcp-and-api.md)
- [Development guide](docs/development.md)
- [Approved design specification](docs/superpowers/specs/2026-09-04-personal-context-os-design.md)
- [Implementation plan](docs/superpowers/plans/2026-09-04-personal-context-os.md)
- [Changelog](CHANGELOG.md)
