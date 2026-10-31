# Chit MCP connect panel

Date: 2026-10-31  
Status: approved for planning  
Scope: desktop app (`apps/desktop`) only

## Goal

Chit shows a collapsible **Connect MCP** section under the brand header so a user can copy a Cursor `mcpServers` snippet with real paths for this machine, and understand that MCP writes need desk approval.

## Decisions

| Choice | Decision |
|--------|----------|
| Placement | Collapsible panel under brand header (collapsed by default) |
| Clients | Cursor JSON only |
| Paths | Resolve `personal-os-mcp` next to the running executable; pack path from current host status |
| Missing binary | Error message; do not emit a fake `command` path |
| Out of scope | Claude Code / Codex snippets, writing Cursor config to disk, pack-path editing in this panel, multi-client tabs |

## UI

1. Brand header unchanged (title + tagline).
2. Directly below it: disclosure control labeled **Connect MCP** (native `<details>` or equivalent with accessible expand/collapse).
3. When expanded:
   - One short lead: point Cursor at this pack via MCP.
   - Read-only JSON for a single server entry, e.g. `mcpServers.personal-os` with `command` and `args: ["--pack", "<packPath>"]`.
   - **Copy** button copies that JSON (or the full `mcpServers` object — same content the user would paste into Cursor MCP settings).
   - One line: MCP writes stay pending until **Approve** in the desk.
4. If `personal-os-mcp` is not found beside the running binary: show an error in the panel; hide or disable Copy until resolved.

Visual style matches the existing desk (system font, existing brand bar colors). No new card chrome beyond what the desk already uses for panels.

## Data / API

New Tauri command, e.g. `mcp_connect_info`, returns:

```ts
type McpConnectInfo = {
  mcpBinary: string; // absolute path; only present when the file exists
  packPath: string;  // absolute path of the active pack
};
```

Behavior:

- `packPath` from `Host::status().pack_path` (same source as today).
- `mcpBinary`: `std::env::current_exe()`’s parent directory + `/personal-os-mcp` (`.exe` on Windows). Canonicalize when possible. If that path is not a file, the command returns `Err(String)` with a clear message (e.g. binary not found at …). No partial success object.
- Frontend builds the Cursor JSON from a successful result. Do not invent paths in the UI.

Tests:

- Rust: with a temp dir containing a fake `personal-os-mcp` file and a mocked/current-exe override **or** unit-test a pure helper that takes `(exe_dir, pack_path)` and asserts the resolved binary path and error when missing.
- React: Connect panel renders collapsed; expands; shows snippet when info loads; Copy invokes clipboard (mock); shows error state when invoke fails.

## Non-goals

- Bundling or relocating `personal-os-mcp` beyond “sibling of the running binary” (release builds already place it there when Tauri bundles sibling bins).
- Auto-detecting Cursor’s config file location.
- HTTP MCP / remote URL connect.

## Docs touch

- Mention the in-app Connect panel in `apps/desktop/README.md` Cursor MCP section (one sentence + pointer).
- Changelog Unreleased note.
