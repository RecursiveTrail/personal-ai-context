# Chit

The local consciousness layer and MCP runtime for personal AI agents.

Tauri companion for one on-disk Personal OS pack. The window is a desk for browsing shelves, editing notes, and approving MCP writes. Rust keeps an in-memory index, writes version 1 Markdown, and serves localhost HTTP. Agents talk to the separate `personal-os-mcp` binary.

Pack format matches [docs/pack-format.md](../../docs/pack-format.md). Tool and route shapes are in [docs/mcp-and-api.md](../../docs/mcp-and-api.md#desktop-companion).

## Run

From the repository root, with Node.js 20+ and a stable Rust toolchain (see the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)):

```sh
npm install
npm run tauri:dev -w @personal-os/desktop
# or: npm run build:desktop
```

Cargo output defaults to `$TMPDIR/personal-os-desktop-target` (not `src-tauri/target`). That avoids macOS AppleDouble `._*` sidecars on exFAT checkouts, which break Tauri’s permission codegen. Override with `CARGO_TARGET_DIR` if you want.

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

## Desk

The window has four regions:

- **Shelves.** “All notes” plus one entry per shelf.
- **Notes.** Titles in the selected shelf, and **New note**.
- **Editor.** Title, shelf, comma-separated tags, and Markdown body. **Save** writes the pack immediately. **Delete** asks for confirmation, then removes the note immediately. An empty title or shelf cannot be saved.
- **Pending approval.** A count badge and one row per MCP proposal: title (or the delete target), shelf, `upsert` or `delete`, and a short excerpt. **Approve** applies that write and drops the queue file. **Reject** drops the queue file and leaves shelf Markdown as it is. The list loads when the window opens, again every 5 seconds, and after each action. Approving a delete whose note is already gone shows an error and keeps the row so it can be rejected.

Reads in the desk and over MCP show the approved pack. Queued proposals stay in `_meta/pending/` until approve or reject.

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

Read tools match the Node server: `list_shelves`, `search_context`, `get_note`, and `reload_pack`. They do not include queued proposals.

Writes wait for the desk:

- `upsert_note` with `{ "id"?, "title", "shelf", "body", "tags"? }` queues a create when `id` is omitted and an update when `id` is set. The return value is `{ "pending": true, "id", "op": "upsert", "preview" }`. The Markdown file appears after **Approve**.
- `delete_note` with `{ "idOrPath" }` queues a delete and returns `{ "pending": true, "id", "op": "delete", "preview" }`. The note stays until **Approve**.
- `list_pending` takes no arguments and returns the queued records. The desktop re-reads `_meta/pending/` from disk; this MCP process keeps the queue it loaded at startup, so its list can still show a record after the desk has already approved or rejected it. Restart `personal-os-mcp` to refresh that list. Pack reads follow the watcher or `reload_pack`.

## Capture sync

With the companion up, the capture app `POST`s its `localStorage` notes to `http://127.0.0.1:8787/sync`. HTTP writes apply immediately and do not enter the approval queue. Each id keeps the note whose `updated` timestamp is newer (equal timestamps take the incoming note only when the content differs; identical notes are not rewritten). `created` is kept from the first copy stored. Notes that exist only on the server stay. Deleting a note in capture sends a best-effort `DELETE /notes/:id` when the companion is up. A delete made while the companion was down is not sent and the note returns on the next sync; delete it in the desk or with `DELETE /notes/:id` once the companion is up. Zip export remains the plugin install path for `apps/context-mcp`.

## Branding

App icon source: `src-tauri/app-icon-source.png`. Regenerate platform icons with:

```sh
npx tauri icon src-tauri/app-icon-source.png --output src-tauri/icons
```

