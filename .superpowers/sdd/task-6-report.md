# Task 6 report — Localhost HTTP API

- Added `src/http.rs` (axum 0.8): `serve(store, addr) -> io::Result<()>` binds only the given addr; `serve_listener`/`router` exposed for tests.
- Routes: GET /health, /notes, /notes/{*id} (id or path, 404), PUT /notes/{*id} (upsert; LWW — server copy returned if strictly newer; 400 on invalid input/timestamp), DELETE (404 if missing), POST /sync, GET /shelves, GET /search (`hint` "Broaden query or drop shelf filter" when empty).
- CORS: origin predicate reflecting only http(s)://localhost[:port] and 127.0.0.1[:port] (rejects e.g. localhost.evil.com); methods GET/POST/PUT/DELETE/OPTIONS, any headers. Tauri/GitHub Pages origins not yet added.
- Added `reqwest` 0.12 (no default features, json) to dev-deps; `pub mod http` in lib.rs.
- Tests (3): health_and_sync_round_trip, put_delete_search_and_errors, cors_reflects_localhost_origins_only. Full suite 24 passed; fmt + clippy clean.
- Run with `CARGO_TARGET_DIR=/tmp/personal-os-task-6-target` (exFAT `._` files break the in-tree target dir; removed the stale in-tree `target/`).
- Note: tests and impl were written together; no separate observed RED run.
- Set `core.fileMode=false` in the worktree (exFAT shows every file as mode-changed); commit contains only my 4 files.

## Important findings follow-up

- PUT now parses every supplied `updated` value as RFC3339 before taking the write lock or calling `upsert_note`; invalid timestamps return 400 and do not create new ids.
- Sync now validates the complete batch's upsert prerequisites and timestamps, including relevant server timestamps, before the first filesystem/store mutation. Staged timestamp decisions preserve sequential LWW behavior for duplicate ids.
- RED evidence:
  - `cargo test put_rejects_invalid_updated_without_creating_note` failed: expected 400, received 200.
  - `cargo test sync_rejects_entire_batch_before_writing_valid_prefix` failed: the valid first note remained readable (200) after the batch returned 400.
- GREEN evidence:
  - `CARGO_TARGET_DIR=/tmp/personal-os-task-6-target cargo test -q`: 26 passed, 0 failed.
  - `CARGO_TARGET_DIR=/tmp/personal-os-task-6-target cargo clippy -q --all-targets -- -D warnings`: passed.
  - `cargo fmt --check`: passed.
  - `git diff --check`: passed.
