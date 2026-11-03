# Chit responsive desk, capture-aligned nav, and immediate MCP writes

Date: 2026-11-03  
Status: approved for planning  
Scope: desktop app (`apps/desktop`) — React desk, Tauri/MCP write path, docs/tests that describe approval

## Goal

Chit fills the window and resizes cleanly; navigation matches the capture app’s topbar/hash-route pattern; **Connect MCP** is a full page; MCP agent writes apply to the pack immediately with no approval queue or Pending UI.

## Decisions

| Choice | Decision |
|--------|----------|
| Navigation | `react-router-dom` **HashRouter** — `#/` desk, `#/connect` Connect MCP (hash URLs match capture; router leaves room for more screens) |
| Header | Capture-style `topbar`: brand **Chit** + tagline, clickable brand → home; `deskNav` text links **Home** and **Connect MCP** with `isActive` / `aria-current` |
| Visual system | Reuse capture’s CSS variables and fonts (warm canvas, teal primary, Newsreader + Source Sans 3). Drop the black brand bar |
| Desk layout | Full-viewport three columns (shelves \| notes \| editor). Not capture’s centered `1080px` max-width — that would recreate empty side space |
| Connect page | Full in-app route replacing the desk; centered content width like capture content pages; snippet + Copy; no approval copy |
| MCP writes | `upsert_note` / `delete_note` write the pack immediately (same store path as desk Save/Delete) |
| Approval | Remove PendingPanel, Tauri `list_pending` / `approve_pending` / `reject_pending`, MCP `list_pending` tool, and pending-queue code path |
| Leftover `_meta/pending/` | Ignore (scanner already skips `_meta/`); no migrate/delete pass required |
| Out of scope | Capture app changes, cloud sync, new shelves UX, Claude/Codex connect snippets, writing Cursor config to disk |

## UI

### Chrome

1. Persistent header modeled on capture’s `topbar` / `topbarInner` / `brand` / `deskNav`.
2. Brand: **Chit** (display font) and existing tagline (“The local consciousness layer…”). Capture-style absolute `brandHome` control over the brand block navigates to `#/`.
3. Nav buttons: **Home** → `#/`; **Connect MCP** → `#/connect`. Active route uses capture’s `isActive` weight/color treatment.
4. No separate gray “Connect MCP” disclosure strip under the header.

### Desk (`#/`)

1. Three-column grid fills remaining viewport height and width under the topbar.
2. `html` / `body` / `#root` / app shell form a full-height flex column so the desk is not stuck top-left with empty void.
3. Columns respond to window resize: shelf and notes columns keep usable fixed-ish widths; editor column is `1fr` and grows/shrinks. Vertical scroll lives inside columns as needed; editor body textarea grows with the column.
4. Shelves → notes in selected shelf → selected note editor (unchanged interaction model). New note / Save / Delete stay immediate.

### Connect MCP (`#/connect`)

1. Full page (desk unmounted or not shown).
2. Lead copy: point Cursor at this pack via MCP.
3. Read-only JSON snippet + **Copy** (existing `mcp_connect_info` + `cursorMcpSnippet`).
4. Error if binary/info load fails; disable or hide Copy until resolved.
5. Remove the line about MCP writes pending approval.

## Data / MCP / Tauri

### Immediate writes

- MCP `upsert_note` / `delete_note` call the same pack write path the desk already uses (no enqueue).
- Return shapes: upsert returns the saved note object (same fields as `get_note`); delete returns `{ "ok": true }` when a note was removed and `{ "ok": false }` when the id/path was not found (mirrors the store’s `bool`). Never `{ pending: true, … }`. Tool descriptions drop “queued for approval” language.
- Remove MCP tool `list_pending`.

### Removals

- React: `PendingPanel`, pending slot in the desk, approve/reject API wrappers used only by that UI.
- Tauri commands: `list_pending`, `approve_pending`, `reject_pending`.
- Rust: pending queue module and wiring from MCP/host (delete dead code rather than leave unused).
- Docs: desktop README, `docs/mcp-and-api.md` desktop companion section, agent-kb mentions of MCP approval — update as part of implementation (or propose AGENTS/agent-kb updates per doc hygiene).

### Unchanged

- Pack format version 1; desk CRUD Tauri commands; HTTP sync still immediate; `mcp_connect_info`; localhost-only companion.

## Errors

- Desk: keep inline alert for load/save failures.
- Connect: inline error for connect-info failure; Copy no-ops when there is no snippet.
- MCP: validation failures remain tool errors whose text is `{"error":"..."}`.

## Tests

- App: hash routes between Home and Connect; brand/nav land on desk; PendingPanel absent.
- ConnectMcp: snippet + Copy; no approval reminder.
- Layout: smoke or CSS contract that shell/desk use full height (at least assert structure/classes; visual resize is manual).
- Rust/MCP: upsert creates/updates Markdown immediately; delete removes immediately; no `list_pending`; drop or rewrite pending-queue tests.

## Non-goals

- Auto-applying or deleting existing `_meta/pending/*.json`.
- Sharing a CSS package with capture in this change (copy tokens/patterns; extract shared theme later if needed).
- Dark-mode toggle parity with capture in this change (optional follow-up; tokens may include dark vars for later).
