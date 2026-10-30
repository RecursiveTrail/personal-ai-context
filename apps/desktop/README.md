# Personal OS Desktop

Tauri companion for one on-disk Personal OS pack. The window shows pack path, note count, and health. Rust keeps an in-memory index, writes version 1 Markdown, and serves localhost HTTP. Agents talk to the separate `personal-os-mcp` binary.

Pack format matches [docs/pack-format.md](../../docs/pack-format.md). Tool and route shapes are in [docs/mcp-and-api.md](../../docs/mcp-and-api.md#desktop-companion).

## Run

From the repository root, with Node.js 20+ and a stable Rust toolchain (see the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)):

```sh
npm install
npm run tauri:dev -w @personal-os/desktop
```

The app uses `~/.personal-os/personal-os` (`%USERPROFILE%\.personal-os\personal-os` on Windows). The first launch creates that directory and the default shelf folders: `preferences`, `routines`, `ai-collaboration`, `goals`, `work`, and `personal`. HTTP listens on `127.0.0.1:8787`.

```sh
curl -s http://127.0.0.1:8787/health
```

A healthy process returns `{"ok":true,"notes":N}`.

Rust tests and the MCP binary:

```sh
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo build --bin personal-os-mcp --manifest-path apps/desktop/src-tauri/Cargo.toml
```

`cargo test` checks parse, store, sync, HTTP, and MCP behavior. It does not record timings. Reads after load use the in-memory index; a cold start for a few hundred notes is intended to land around half a second.

The debug binary is `apps/desktop/src-tauri/target/debug/personal-os-mcp`. It requires `--pack` and loads its own index. After capture or another process writes the pack, call `reload_pack`. The Tauri process watches the directory itself (250ms debounce, then a full reload).

## Cursor MCP

Point `personal-os-mcp` at the companion pack, or at any version 1 directory such as `fixtures/personal-os`:

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

Stdout is the MCP stream. Diagnostics go to stderr.

Read tools match the Node server: `list_shelves`, `search_context`, `get_note`, and `reload_pack`. Writes:

- `upsert_note` with `{ "id"?, "title", "shelf", "body", "tags"? }` creates a note when `id` is omitted and updates when `id` is set. The return value is the full note.
- `delete_note` with `{ "idOrPath" }` returns `{ "ok": true }`, or `{ "ok": false, "error": "not_found" }`.

## Capture sync

With the companion up, the capture app `POST`s its `localStorage` notes to `http://127.0.0.1:8787/sync`. Each id keeps the note whose `updated` timestamp is newer (equal timestamps take the incoming note). Notes that exist only on the server stay. A delete made while the companion was down is not sent; delete that note with `DELETE /notes/:id` or `delete_note` once it is up. Zip export remains the plugin install path for `apps/context-mcp`.
