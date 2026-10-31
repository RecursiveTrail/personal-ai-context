# Task 1 Report: PendingQueue

Status: DONE. Commit aaf9391 "Add durable MCP pending queue under _meta/pending."
Files: apps/desktop/src-tauri/src/pending.rs (new), src/lib.rs (`pub mod pending`).

## TDD
- Red: stubs with `todo!()` + 6 tests -> 6 failed.
- Green: implementation -> 6 passed; full `cargo test` 48 passed (CARGO_TARGET_DIR=/tmp/personal-os-pending-t1).

## API
- `PendingOp {Upsert, Delete}` (serde lowercase); `PendingRecord` (serde camelCase: id, op, createdAt, source="mcp", note, targetIdOrPath, status="pending").
- `PendingQueue::load(PathBuf) -> Self` (skips corrupt JSON, dotfiles, id/filename mismatches; logs via eprintln).
- `enqueue_upsert(UpsertInput) -> Result<PendingRecord>`: materializes Note (id via new_note_id, timestamps, path `shelf/slug.md`); not applied to store.
- `enqueue_delete(&str) -> Result<PendingRecord>`.
- `list()` sorted by createdAt then id. `approve(id, &mut Store)`, `reject(id)`.
- id `pend_` + 12 hex (uuid v4); files `_meta/pending/<id>.json`, written via tmp + rename.
- `PendingError`: NotFound, NoteNotFound, Invalid, Io, Json, Store.

## Behavior decisions
- Approve upsert passes `updated: None` (stamped at approval time) and `created: Some(note.created)`; Store keeps stored created for existing notes.
- Approve delete of a missing note -> `NoteNotFound`, record stays queued (per spec).
- Failed approve leaves the record queued. Unknown id -> `NotFound`.
- Unknown-id/enqueue validation is light (non-empty title/shelf/target); full shelf validation happens at approve via Store.

## Concerns
- Queue is not internally locked; callers must hold the shared write lock around queue + store (spec).
- Enqueue-time `path` is a preview; Store may choose a numeric-suffixed path on approve.
- Shelf validation (e.g. "../x") is deferred to approve; could make Store::validate_shelf pub(crate) to reject early.
- Did not verify watch.rs ignores `_meta/pending` events (grep for `_meta` in watch.rs found nothing); later tasks should check watcher doesn't trigger reloads/sync on pending writes.

## Important finding fix: omitted tags
- Added durable `tagsSpecified` state (serialized only when false) so queued upserts preserve the distinction between omitted tags and an explicit tag list.
- Approval now forwards `tags: None` when tags were omitted, retaining existing tags on update.
- Added a reload-through-disk regression test: updating a tagged note's title with omitted tags preserves `["style"]`.
- TDD: regression failed with `left: []`, passed after the fix; full library suite passes (49 tests).
