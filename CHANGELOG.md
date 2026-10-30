# Changelog

All notable changes are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Importing an older pack without `_meta/shelves.json` adds missing shelves and leaves existing shelf names, descriptions, and colors as they are.
- An imported note whose path is already used gets a numeric suffix, and Mac archive junk is ignored.

### Added

- Tauri desktop companion (`apps/desktop`) serves a local pack at `~/.personal-os/personal-os` over HTTP on `127.0.0.1:8787` and reloads that folder when files change. Pack format stays version 1.
- `personal-os-mcp` stdio server exposes the read tools plus `upsert_note` and `delete_note`, which write the pack immediately.
- Capture syncs notes to the companion with last-write-wins on `updated` when `127.0.0.1:8787` is reachable. Zip export remains the plugin install path. A server note missing from the client payload is restored into the browser on the next successful sync; removing it takes `DELETE /notes/:id` or `delete_note`.
- Download pack now saves `personal-os-plugin.zip`, a plugin bundle with the pack at `plugin/personal-os`.
- Install guide in the capture app and `INSTALL.md` in the zip for Claude Code, Cursor, and Codex / ChatGPT desktop.
- Import plugin merges a plugin zip or an older `personal-os.zip` after a summary.
- Optional `_meta/shelves.json` stores shelf names, descriptions, and colors; the server ignores it and pack `version` stays 1.
- Default `work` and `personal` shelves in the capture desk and ledger.
- Longer dictation keep-alive so pauses can continue without losing earlier transcript text.
- MCP/HTTP shelf listing includes empty on-disk shelf folders.
- `reload_pack` MCP tool and `POST /reload` HTTP endpoint to re-read an unpacked pack after export.

## [0.1.0] - 2026-09-04

### Added

- Browser-local capture, editing, deletion, and persistence for Personal OS notes.
- Browser SpeechRecognition capture with type/paste fallback.
- Downloadable `personal-os.zip` containing atomic Markdown notes and a version 1 manifest.
- Browser-safe pack types, parsing, serialization, manifest generation, and deterministic keyword/shelf search.
- Node filesystem pack loading with corrupt-note isolation.
- Read-only MCP tools: `list_shelves`, `search_context`, and `get_note`.
- Optional read-only HTTP endpoints for health, shelves, search, and note retrieval.
- Fixture pack and automated workspace test suites.
