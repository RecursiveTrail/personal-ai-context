# Task 6 report — Docs: README, MCP API, changelog

**Status:** DONE_WITH_CONCERNS

**Commit:** `04f3ec0` Document immediate MCP writes and Chit hash navigation.

## Changes

- `apps/desktop/README.md`: dropped four-region / pending-approval desk; documented capture-aligned topbar, `#/` Home (three columns) and `#/connect` Connect MCP; MCP `upsert_note` / `delete_note` apply immediately and return the saved note / `{ ok }`; no `list_pending`; leftover `_meta/pending/` ignored.
- `docs/mcp-and-api.md` desktop companion: removed pending-queue paragraphs, `list_pending` row, and `{ pending: true }` shapes; documented immediate write return shapes (saved `Note`; `{ "ok": true|false }`; empty `idOrPath` error `{"error":"idOrPath must not be empty"}`); noted leftover `_meta/pending/` is ignored.
- `CHANGELOG.md` Unreleased: added the required nav + immediate-writes bullet; rewrote contradictory Unreleased items that still described a collapsed Connect panel, `list_pending`, and desk Approve.

Did not edit `AGENTS.md` or `docs/agent-kb/`.

## Verification

- Re-read the three files against the Task 6 brief checklist (hash routes, three-column desk, immediate return shapes, no `list_pending`, leftover `_meta/pending/` note).
- `rg` on the three files: remaining “pending” mentions are only leftover-`_meta/pending/` ignore notes and “there is no `list_pending`”.
- `git diff --check --cached`: passed.
- Commit scope: exactly `apps/desktop/README.md`, `docs/mcp-and-api.md`, `CHANGELOG.md` (3 files, +34 / −43). Working tree clean.

## Self-review

- Matches Task 1 return shapes: upsert → saved note object; delete → `{ "ok": true }` / `{ "ok": false }`; no `list_pending`.
- Hash routes documented as `#/` / `#/connect` (HashRouter); Connect is a full page, not a header `<details>`.
- Approve/reject instructions removed from README and mcp-and-api.

## Concerns

- `apps/capture/README.md` still says HTTP sync does **not** enter Chit’s MCP approval queue (queue is gone). Out of this task’s file list.
- `docs/architecture.md` still describes the window as a “status host” (pre-desk). Out of this task’s file list.

## Proposed `AGENTS.md` / `docs/agent-kb/` updates (do not apply until yes)

1. `AGENTS.md` repo map — `apps/desktop`: change “desk + MCP approval” to desk, `#/` / `#/connect`, and immediate MCP writes (no approval queue).
2. `docs/agent-kb/overview.md` Components table — Chit row: drop “MCP write approval” and “Connect MCP panel”; say write-capable MCP and full-page Connect MCP (`#/connect`).
3. `docs/agent-kb/workflows.md` Capture ↔ Chit sync:
   - Step 4: MCP `upsert_note` / `delete_note` write the pack immediately (no `_meta/pending/` / desk Approve).
   - Step 6: “Connect MCP panel” → Connect MCP page (`#/connect`).

## Final-review fixes

**Status:** DONE

- `apps/capture/README.md`: removed the obsolete MCP approval-queue reference while retaining immediate on-disk sync behavior.
- `CHANGELOG.md`: merged the overlapping Chit navigation and Connect MCP entries into one accurate Unreleased bullet covering `#/`, `#/connect`, the full-page Connect view, immediate MCP writes, and approval removal.
- `apps/desktop/src/components/Desk.tsx`: preserved the `Note not found` error instead of immediately clearing it.
- `npm test -w @personal-os/desktop`: passed (2 test files, 11 tests).
- IDE diagnostics for `Desk.tsx`: no linter errors.
- `git diff --check`: passed.
