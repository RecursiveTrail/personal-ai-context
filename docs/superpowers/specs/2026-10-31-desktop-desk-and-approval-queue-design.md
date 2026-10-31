# Desktop desk UI and MCP approval queue

Date: 2026-10-31

## Goal

Grow the Tauri companion from a status shell into a desk that can browse, edit, create, and delete pack notes on disk, and route all MCP write tools through a human approval queue before they touch the live pack. Browser capture HTTP writes stay immediate.

## Decisions

| Topic | Choice |
| --- | --- |
| Sub-project | Richer desk + approval queue (skills, terminal, Git deferred) |
| Desk scope | Browse shelves/notes; edit Markdown; create/delete — no voice/PDF/how-to |
| MCP writes | All `upsert_note` / `delete_note` enqueue until approve/reject |
| HTTP / capture | Immediate apply (human already editing) |
| UI | New React app in `apps/desktop` via Tauri commands (not embed capture) |
| Queue architecture | Pending records under `_meta/pending/`; approve applies Store; reject drops |

## Non-goals

- Skills registry, embedded terminal, Git sync
- Queuing browser/HTTP writes
- Porting capture voice, PDF, or how-to into Tauri
- Changing version 1 note Markdown shape (pending is sidecar metadata)
- Soft-apply-then-undo or a second draft pack tree

## Architecture

```text
Capture ──HTTP (immediate)──► Rust Store ──► pack shelf/*.md
Tauri React desk ──commands──► Rust Store + PendingQueue
Cursor / Claude ──MCP writes──► PendingQueue ──approve──► Store
                              └──reject──► drop
MCP / desk reads ────────────► Store only (no pending in search)
```

Disk remains the contract (`docs/pack-format.md`). Pending files live under `_meta/pending/` and are ignored by the note scanner (same as today’s `_meta` skip).

## Pending record

Path: `_meta/pending/<id>.json` where `id` is `pend_` + 12 hex characters.

```json
{
  "id": "pend_abcdef123456",
  "op": "upsert",
  "createdAt": "2026-10-31T12:00:00.000Z",
  "source": "mcp",
  "note": {
    "id": "note_…",
    "title": "…",
    "shelf": "preferences",
    "tags": [],
    "created": "…",
    "updated": "…",
    "body": "…",
    "path": "preferences/….md"
  },
  "targetIdOrPath": null,
  "status": "pending"
}
```

- `op`: `upsert` | `delete`
- For `delete`, `note` may be null; `targetIdOrPath` is required (id or pack-relative path)
- For `upsert` of an existing note, `note.id` / path identify the target; create omits a pre-existing disk file until approve

**Approve:** call existing Store upsert/delete; remove pending file; refresh in-memory index.  
**Reject:** delete pending file only.

## MCP

### Writes (behavior change)

`upsert_note` and `delete_note` no longer mutate the pack immediately. They enqueue and return JSON text:

```json
{
  "pending": true,
  "id": "pend_…",
  "op": "upsert",
  "preview": { "title": "…", "shelf": "…", "path": "…" }
}
```

### Reads

`list_shelves`, `search_context`, `get_note`, `reload_pack` unchanged in shape; they see approved pack only.

### New

`list_pending` — returns the pending array (same fields as stored records, or a slim preview list).

## Tauri commands

| Command | Role |
| --- | --- |
| `list_shelves` | Shelf names |
| `list_notes(shelf?)` | Notes (optional shelf filter) |
| `get_note(idOrPath)` | Full note or null |
| `upsert_note(input)` | Immediate human write |
| `delete_note(idOrPath)` | Immediate human delete |
| `list_pending` | Queue |
| `approve_pending(id)` | Apply + remove |
| `reject_pending(id)` | Remove |
| Existing status / pack path | Keep |

Human command writes share the same Store as HTTP.

## Desk UI

React in `apps/desktop` (Vite already present):

- Left: shelves
- Center: notes in the selected shelf
- Editor: open note body/title/tags; save via `upsert_note`; delete via `delete_note`
- Pending panel: count badge; list with title/shelf/op/excerpt; Approve / Reject
- Echo capture visual tokens where practical; do not import capture app modules

## Errors and concurrency

- Unknown pending id on approve/reject → structured error
- Approve of delete for a missing note → treat as success-after-remove or clear error; prefer “not found” and leave pending for human reject
- Store `RwLock` shared with HTTP/MCP; pending IO under the same write lock as apply
- Corrupt pending JSON → skip + log; rest of queue serves
- MCP clients that assumed immediate writes must handle `pending: true` (document in mcp-and-api.md)

## Testing

- Rust: enqueue, list, approve upsert, approve delete, reject; reads do not see pending bodies
- MCP handler tests: write tools return pending payload
- Desk: component tests for pending panel actions (mock invoke)
- Manual: agent `upsert_note` → appears in Pending → Approve → file on disk and in capture sync

## Docs

Update `docs/mcp-and-api.md` (Desktop companion), `apps/desktop/README.md`, `CHANGELOG.md`. Ask before changing `AGENTS.md` / `docs/agent-kb/`.

## Success criteria

1. User can browse/edit/create/delete notes in the Tauri window against the on-disk pack.
2. MCP writes never land on disk until Approve.
3. Capture HTTP sync/PUT/DELETE still apply immediately.
4. Reject leaves the pack unchanged.
