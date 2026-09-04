# Changelog

All notable changes are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
