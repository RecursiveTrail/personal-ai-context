# Personal Context OS — Design Spec

**Date:** 2026-09-04  
**Status:** Approved for planning  
**Product name (working):** Personal Context OS

## Problem

AI agents have broad knowledge but lack the user's personal context: preferences, routines, taste, how they like to work with AI, and lived judgment. That context lives in the user's head and is awkward to paste into every chat.

## Goals

- Capture personal context by **speaking** (with type/paste fallback), transcribe it, and store it in a **portable, agent-friendly format**.
- Stay **LLM-agnostic**: any agent can pull relevant context via **MCP** (and a thin HTTP API).
- Organize context in **topic shelves** so retrieval is predictable.
- Keep **v1 private and simple**: browser-local storage, no accounts, no cloud store; user **downloads** a pack and points MCP at it.
- Ship **maintainability docs**: architecture, pack-format contract, MCP/API reference, and developer guide so the system can evolve safely.

## Non-goals (v1)

- Native mobile apps (App Store / Play Store)
- Google Drive or other cloud sync (deferred)
- Hosted backend, user accounts, or server-side storage of notes
- Semantic / vector search (deferred; keyword + shelf is enough for v1)
- Work/product judgment or people/relationship verticals as primary focus (Personal OS first; shelves can expand later)
- Auto-classify shelves with an LLM (manual shelf pick in v1)

## Users & success criteria

**Primary user:** the builder themselves (single-user).

**v1 is done when both are true:**

1. **Capture loop:** speak → transcript → save under the correct shelf in the browser → survive refresh.  
2. **Agent pull:** from Cursor (or similar), MCP query against an exported pack returns useful Personal OS snippets for a real task.

## Architecture

Two loosely coupled pieces; the **file pack** is the contract.

```
┌─────────────────────┐         download zip/folder        ┌─────────────────────┐
│  Capture PWA        │ ─────────────────────────────────► │  personal-os/ pack  │
│  (browser store)    │                                     │  (on disk)          │
└─────────────────────┘                                     └──────────┬──────────┘
                                                                       │ path config
                                                                       ▼
                                                            ┌─────────────────────┐
                                                            │  Local MCP + HTTP   │
                                                            │  list / search / get│
                                                            └──────────┬──────────┘
                                                                       │
                                                                       ▼
                                                            ┌─────────────────────┐
                                                            │  Any LLM agent      │
                                                            └─────────────────────┘
```

- **Capture app:** PWA — record, review, shelf, save, browse, download.  
- **Context MCP:** local process — reads the pack from a configured filesystem path.  
- **No shared database.** Re-export/replace the folder when notes change (manual refresh in v1).

## Data model

### Pack layout

```
personal-os/
  preferences/
  routines/
  ai-collaboration/
  goals/
  _meta/
    manifest.json
```

Unknown top-level directories (except `_meta`) are treated as additional shelves so the format can grow without breaking MCP.

### Note file

Markdown with YAML frontmatter:

| Field     | Purpose                                      |
|-----------|----------------------------------------------|
| `id`      | Stable unique id                             |
| `title`   | Short label for agents and UI                |
| `shelf`   | Shelf name (must match parent folder)        |
| `tags`    | Optional string list                         |
| `created` | ISO timestamp                                |
| `updated` | ISO timestamp                                |

Body: plain prose the agent can quote. Prefer **atomic notes** (one preference / rule / idea per file), not long diary dumps.

### Manifest (`_meta/manifest.json`)

Lists notes (id, path, shelf, title, updated) so tools can inventory the pack without relying only on directory walks. MCP may still scan the filesystem; manifest is the canonical inventory when present and valid.

### Browser store

Mirror the same logical structure in `localStorage`. If quota becomes a problem, migrate the same schema to IndexedDB in a follow-up without changing the export format. Download rebuilds the pack from the store.

## Capture app (PWA)

### Flow

1. **Record** — tap/hold to speak using browser SpeechRecognition / on-device STT where available.  
2. **Review** — show transcript; user edits before save.  
3. **Shelf** — user picks among v1 shelves (manual).  
4. **Save** — persist note + frontmatter into local store.  
5. **Library** — browse by shelf; edit/delete.  
6. **Download** — one action produces a **zip** of `personal-os/` including `_meta/manifest.json`. User unzips to a folder for MCP.

### Fallbacks & constraints

- STT unsupported or mic denied → clear message + **type/paste** path.  
- No account, no server.  
- Mic requires secure context (HTTPS or localhost).  
- Installable / offline browse-edit-save is desirable but not a blocker for the v1 success bar.

### Default shelves (Personal OS)

- `preferences`  
- `routines`  
- `ai-collaboration`  
- `goals`  

## MCP & HTTP API

### Configuration

User sets a filesystem path to a `personal-os` pack directory (exported or hand-maintained), e.g. `~/context/personal-os`.

### Tools / endpoints (same semantics)

| Operation        | Behavior |
|------------------|----------|
| `list_shelves`   | Return shelf names present in the pack. |
| `search_context` | Query string + optional `shelf` → ranked snippets (title, path, excerpt, score). |
| `get_note`       | Full note by id or path. |

### Ranking (v1)

Shelf filter (if provided) + keyword match on title, tags, and body. Deterministic and explainable. No embeddings in v1.

### Import story

Download from PWA → unzip to a folder → point MCP at that folder. After updates in the PWA, re-download and replace (or overwrite) the folder. Optional watch-folder refresh is out of v1.

## Error handling

| Situation                         | Behavior |
|-----------------------------------|----------|
| STT / mic failure                 | Message + type/paste path |
| `localStorage` quota              | Prompt download + delete/archive notes; IndexedDB migration later |
| Corrupt/unreadable note on disk   | MCP skips file; surface in tool error/log |
| Empty search                      | Empty list; hint to broaden query or drop shelf filter |
| Missing pack path / empty pack    | Clear configuration error from MCP |
| Stale pack vs browser store       | Expected in v1; user re-exports |

## Testing plan (v1)

1. Capture: save note → appears under shelf → survives page refresh.  
2. Export: archive contains shelves, valid frontmatter, and manifest.  
3. MCP fixture: `list_shelves`, `search_context`, `get_note` against a known pack return expected results.  
4. Manual E2E: one real agent task in Cursor (or another MCP client) pulls a preference and uses it.

## Future work (explicitly deferred)

- Google Drive (or other) sync for the pack  
- On-device semantic index for better retrieval  
- Hosted MCP with user-held tokens  
- Auto-shelf suggestions  
- Additional verticals (work judgment, people/relationships) as first-class defaults  
- Multi-device sync without manual export  

## Decision log

| Decision              | Choice                                      | Why |
|-----------------------|---------------------------------------------|-----|
| Agent consumption     | MCP + pull API                              | Mid-task retrieval; LLM-agnostic |
| v1 vertical           | Personal OS                                 | Daily use; expand shelves later |
| Client                | PWA / web only                              | Avoid app store friction |
| Persistence (v1)      | Browser local store + download              | Privacy + simplicity; Drive later |
| STT                   | Browser / on-device preferred               | Minimize cloud exposure |
| Organization          | Topic shelves + atomic markdown             | Portable; agents understand files |
| Retrieval             | Keyword + shelf                             | Ship E2E; semantic later |
| Coupling              | File pack as contract                       | Capture and MCP evolve independently |
