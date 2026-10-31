# Tauri Desktop Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fast Tauri companion that loads a version-1 pack into memory, serves read/write MCP over stdio plus localhost HTTP for the browser, and lets capture sync notes with last-write-wins on `updated`.

**Architecture:** A Rust core inside `apps/desktop` owns pack parse/serialize, an in-memory store, atomic disk writes, Axum HTTP on `127.0.0.1:8787`, and stdio MCP. Tauri is a thin host (pack path + status). Capture keeps `localStorage` offline and `POST /sync` when the companion is up. Pack shape stays identical to [`docs/pack-format.md`](../../pack-format.md) and JS `@personal-os/pack-core`.

**Tech Stack:** Tauri 2, Rust 2021, Tokio, Axum, Serde/serde_json, `notify`, `uuid`, `parking_lot`, Vitest/React for capture sync client. MCP stdio via the `rmcp` crate (Model Context Protocol Rust SDK) with tool results as one JSON text content item.

## Global Constraints

- Local-first: HTTP binds `127.0.0.1` only; no accounts, cloud sync, or Git in this plan.
- Pack format version 1 is the contract; Rust must round-trip `fixtures/personal-os` notes that JS already parses.
- Agent writes apply immediately; sync conflicts use last-write-wins by note `updated` (ISO-8601 string compare is insufficient — parse as time or require identical format from both sides; both already emit JS `toISOString()` / RFC3339).
- Performance: load pack once into memory; search/list/get hit memory; writes update one note in the index; no Node on the agent path.
- Out of scope: embedded terminal, skills registry, approval queue, removing `apps/context-mcp` or browser capture.
- Do not edit `AGENTS.md` or `docs/agent-kb/` in these tasks; after the last task, ask whether to update them.

## File structure

| Path | Responsibility |
| --- | --- |
| `apps/desktop/package.json` | Workspace package `@personal-os/desktop`; scripts `tauri dev` / `tauri build` |
| `apps/desktop/index.html`, `apps/desktop/src/main.ts` | Minimal status UI (pack path, health, note count) |
| `apps/desktop/src-tauri/Cargo.toml` | Rust deps |
| `apps/desktop/src-tauri/tauri.conf.json` | Tauri 2 app config |
| `apps/desktop/src-tauri/src/lib.rs` | Tauri entry: start store, HTTP, MCP child/stdio wiring, commands |
| `apps/desktop/src-tauri/src/pack/mod.rs` | Module exports |
| `apps/desktop/src-tauri/src/pack/types.rs` | `Note`, `Manifest`, `SearchHit` |
| `apps/desktop/src-tauri/src/pack/note.rs` | Parse/serialize/slug/`new_note_id` |
| `apps/desktop/src-tauri/src/pack/manifest.rs` | `build_manifest` |
| `apps/desktop/src-tauri/src/pack/search.rs` | Keyword search matching JS scoring |
| `apps/desktop/src-tauri/src/store.rs` | In-memory pack: load, get, list, upsert, delete, reload |
| `apps/desktop/src-tauri/src/fs_write.rs` | Atomic write + manifest flush; path confinement |
| `apps/desktop/src-tauri/src/sync.rs` | LWW merge for `POST /sync` |
| `apps/desktop/src-tauri/src/http.rs` | Axum router |
| `apps/desktop/src-tauri/src/mcp.rs` | MCP tool registration over shared `Store` |
| `apps/desktop/src-tauri/src/watch.rs` | Debounced partial reload |
| `apps/capture/src/lib/companionClient.ts` | Health + sync HTTP client |
| `apps/capture/src/lib/companionSync.ts` | Orchestrate offline vs sync into `notesStore` |
| `apps/capture/src/App.tsx` | Online/offline indicator + sync on focus/interval |
| `docs/architecture.md`, `docs/mcp-and-api.md`, `CHANGELOG.md` | Document companion after it works |

---

### Task 1: Scaffold `apps/desktop` (Tauri 2 + Rust lib tests)

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/vite.config.ts`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/src/pack/mod.rs`
- Create: `apps/desktop/src-tauri/src/pack/types.rs`
- Modify: root `package.json` only if workspaces do not already cover `apps/*` (they do — no change)

**Interfaces:**
- Consumes: none
- Produces: Cargo package `personal-os-desktop` that `cargo test` can run; Tauri app name `personal-os-desktop`

- [ ] **Step 1: Create the Vite + Tauri package skeleton**

`apps/desktop/package.json`:

```json
{
  "name": "@personal-os/desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

`apps/desktop/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Personal OS</title>
  </head>
  <body>
    <main>
      <h1>Personal OS</h1>
      <p id="status">Starting…</p>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`apps/desktop/src/main.ts`:

```ts
const status = document.getElementById("status");
if (status) status.textContent = "Companion UI ready";
```

`apps/desktop/vite.config.ts`:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "esnext" },
});
```

- [ ] **Step 2: Create Rust crate with types module**

`apps/desktop/src-tauri/Cargo.toml`:

```toml
[package]
name = "personal-os-desktop"
version = "0.1.0"
description = "Personal OS Tauri companion"
authors = ["Personal OS"]
edition = "2021"

[lib]
name = "personal_os_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "fs", "io-util"] }
axum = "0.8"
tower-http = { version = "0.6", features = ["cors"] }
parking_lot = "0.12"
uuid = { version = "1", features = ["v4"] }
notify = "7"
notify-debouncer-mini = "0.5"
chrono = { version = "0.4", features = ["serde"] }
thiserror = "2"
rmcp = { version = "0.6", features = ["server", "transport-io"] }
futures = "0.3"

[dev-dependencies]
tempfile = "3"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "test-util"] }
```

If `rmcp` version resolution fails at build time, pin the latest published `rmcp` that documents stdio server examples and keep the same tool surface; do not invent a second MCP protocol.

`apps/desktop/src-tauri/src/pack/types.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub shelf: String,
    pub tags: Vec<String>,
    pub created: String,
    pub updated: String,
    pub body: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub id: String,
    pub path: String,
    pub shelf: String,
    pub title: String,
    pub updated: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub notes: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    pub path: String,
    pub shelf: String,
    pub excerpt: String,
    pub score: i32,
}
```

`apps/desktop/src-tauri/src/pack/mod.rs`:

```rust
pub mod types;
```

`apps/desktop/src-tauri/src/lib.rs`:

```rust
pub mod pack;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`apps/desktop/src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    personal_os_desktop_lib::run();
}
```

Add a minimal `tauri.conf.json` for product name `Personal OS`, identifier `os.personal.desktop`, `frontendDist` ../dist, `devUrl` http://localhost:1420, and a single main window. Add `build.rs` that calls `tauri_build::build()`.

- [ ] **Step 3: Install JS deps and verify Rust types compile**

Run from repo root:

```bash
npm install -w @personal-os/desktop
cd apps/desktop/src-tauri && cargo test --lib 2>&1 | tail -20
```

Expected: compile succeeds (zero tests yet is OK) or only missing `generate_context` until `tauri.conf.json` + `capabilities` exist — fix scaffold until `cargo check` passes.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop
git commit -m "$(cat <<'EOF'
Scaffold the Tauri desktop companion package.

EOF
)"
```

---

### Task 2: Parse and serialize notes (TDD against fixtures)

**Files:**
- Create: `apps/desktop/src-tauri/src/pack/note.rs`
- Create: `apps/desktop/src-tauri/src/pack/note_tests.rs` (or `#[cfg(test)]` in `note.rs`)
- Modify: `apps/desktop/src-tauri/src/pack/mod.rs`

**Interfaces:**
- Consumes: `pack::types::Note`
- Produces:
  - `pub fn new_note_id() -> String` — `note_` + 12 lowercase hex chars
  - `pub fn slugify_title(title: &str) -> String` — match JS `slugifyTitle`
  - `pub fn serialize_note(note: &Note) -> String` — match JS `serializeNote`
  - `pub fn parse_note(markdown: &str, path: &str) -> Result<Note, PackError>`

- [ ] **Step 1: Write the failing tests**

In `apps/desktop/src-tauri/src/pack/note.rs` (bottom `#[cfg(test)] mod tests`):

```rust
#[test]
fn slugify_matches_pack_core() {
    assert_eq!(slugify_title("Prefer short answers"), "prefer-short-answers");
    assert_eq!(slugify_title("  "), "note");
}

#[test]
fn round_trip_fixture_prefer_short_answers() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../fixtures/personal-os/preferences/prefer-short-answers.md"
    );
    let raw = std::fs::read_to_string(path).expect("fixture");
    let note = parse_note(&raw, "preferences/prefer-short-answers.md").unwrap();
    assert_eq!(note.id, "note_pref_short");
    assert_eq!(note.title, "Prefer short answers");
    assert_eq!(note.shelf, "preferences");
    assert_eq!(note.tags, vec!["style".to_string()]);
    assert!(note.body.contains("concise bullet"));
    let again = parse_note(&serialize_note(&note), &note.path).unwrap();
    assert_eq!(again, note);
}

#[test]
fn new_note_id_shape() {
    let id = new_note_id();
    assert!(id.starts_with("note_"));
    assert_eq!(id.len(), "note_".len() + 12);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/desktop/src-tauri && cargo test -q slugify_matches_pack_core -- --nocapture
```

Expected: FAIL (functions missing).

- [ ] **Step 3: Implement parse/serialize**

Match JS behavior:

- `slugify_title`: lowercase, trim, non `[a-z0-9]` → `-`, trim `-`, max 80, empty → `"note"`.
- `serialize_note`: YAML frontmatter with `title` / tags JSON-stringified like JS; empty tags as `tags: []`; body `trim_end` + trailing newline.
- `parse_note`: split on first `---` / second `---`; parse `id`, `title`, `shelf`, `tags` (list or missing → `[]`), `created`, `updated`; body is remainder trimmed appropriately; set `path` from argument.
- Hand-roll a small frontmatter parser (line-oriented) rather than pulling incompatible YAML subsets; support the fixture shapes and `serialize_note` output only.

Export from `pack/mod.rs`: `pub mod note; pub use note::*;`

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/desktop/src-tauri && cargo test -q pack::note
```

Expected: PASS. Also round-trip every `fixtures/personal-os/**/*.md` in one test that walks the tree.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/pack
git commit -m "$(cat <<'EOF'
Parse and serialize pack notes in Rust to match pack-core.

EOF
)"
```

---

### Task 3: Search scoring parity

**Files:**
- Create: `apps/desktop/src-tauri/src/pack/search.rs`
- Modify: `apps/desktop/src-tauri/src/pack/mod.rs`

**Interfaces:**
- Consumes: `Note`, `SearchHit`
- Produces: `pub fn search_notes(notes: &[Note], query: &str, shelf: Option<&str>) -> Vec<SearchHit>`

- [ ] **Step 1: Write the failing test**

```rust
#[test]
fn blank_query_returns_all_score_zero() {
    let notes = vec![Note {
        id: "note_a".into(),
        title: "Alpha".into(),
        shelf: "preferences".into(),
        tags: vec![],
        created: "2026-01-01T00:00:00.000Z".into(),
        updated: "2026-01-01T00:00:00.000Z".into(),
        body: "hello world".into(),
        path: "preferences/alpha.md".into(),
    }];
    let hits = search_notes(&notes, "   ", None);
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].score, 0);
}

#[test]
fn scores_title_tag_and_haystack_like_js() {
    let notes = vec![Note {
        id: "note_a".into(),
        title: "Prefer short answers".into(),
        shelf: "preferences".into(),
        tags: vec!["style".into()],
        created: "2026-01-01T00:00:00.000Z".into(),
        updated: "2026-01-01T00:00:00.000Z".into(),
        body: "I prefer concise bullet answers".into(),
        path: "preferences/prefer-short-answers.md".into(),
    }];
    let hits = search_notes(&notes, "prefer style", None);
    assert_eq!(hits[0].id, "note_a");
    // tokens: prefer, style — title+3, tag+2, hay+1 each when present
    assert!(hits[0].score >= 6);
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/desktop/src-tauri && cargo test -q scores_title_tag -- --nocapture
```

- [ ] **Step 3: Implement `search_notes`**

Port `packages/pack-core/src/search.ts` exactly:

- Tokenize: lowercase, split on `[^a-z0-9]+`, keep tokens length > 1.
- Empty tokens + non-blank query → `[]`.
- Empty tokens + blank/whitespace query → all in shelf scope with score `0`.
- Per token: title contains +3; any tag contains +2; combined haystack contains +1.
- Excerpt: whitespace-collapsed body, max 160, ellipsis `…` (Unicode).
- Sort: score desc, then title asc.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/desktop/src-tauri && cargo test -q pack::search
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/pack/search.rs apps/desktop/src-tauri/src/pack/mod.rs
git commit -m "$(cat <<'EOF'
Port keyword search scoring to the Rust pack module.

EOF
)"
```

---

### Task 4: In-memory store load, upsert, delete, manifest

**Files:**
- Create: `apps/desktop/src-tauri/src/pack/manifest.rs`
- Create: `apps/desktop/src-tauri/src/fs_write.rs`
- Create: `apps/desktop/src-tauri/src/store.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: parse/serialize/search
- Produces:
  - `pub struct Store { /* pack_root: PathBuf, notes: HashMap<String, Note>, shelves: BTreeSet<String> */ }`
  - `impl Store { pub fn load(pack_root: PathBuf) -> Result<Self>; pub fn list_shelves(&self) -> Vec<String>; pub fn get_note(&self, id_or_path: &str) -> Option<Note>; pub fn search(&self, query: &str, shelf: Option<&str>) -> Vec<SearchHit>; pub fn upsert_note(&mut self, input: UpsertInput) -> Result<Note>; pub fn delete_note(&mut self, id_or_path: &str) -> Result<bool>; pub fn reload(&mut self) -> Result<()>; pub fn note_count(&self) -> usize; pub fn all_notes(&self) -> Vec<Note>; }`
  - `pub struct UpsertInput { pub id: Option<String>, pub title: String, pub shelf: String, pub body: String, pub tags: Option<Vec<String>>, pub updated: Option<String> }` — when `updated` is `Some`, honor it (HTTP/sync); MCP omits and sets now.
  - `pub fn build_manifest(notes: &[Note]) -> Manifest` with `version: 1`
  - `pub fn write_note_atomic(pack_root: &Path, note: &Note) -> Result<()>`
  - `pub fn remove_note_file(pack_root: &Path, path: &str) -> Result<()>`
  - `pub fn write_manifest(pack_root: &Path, notes: &[Note]) -> Result<()>`
  - Path confinement: reject `path` containing `..` or absolute components

- [ ] **Step 1: Write failing store tests with `tempfile`**

```rust
#[tokio::test]
async fn load_fixture_pack_lists_shelves_and_gets_note() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../fixtures/personal-os");
    let store = Store::load(root).unwrap();
    let shelves = store.list_shelves();
    assert!(shelves.iter().any(|s| s == "preferences"));
    let note = store.get_note("note_pref_short").unwrap();
    assert_eq!(note.title, "Prefer short answers");
}

#[test]
fn upsert_creates_file_and_delete_removes_it() {
    let dir = tempfile::tempdir().unwrap();
    let pack = dir.path().join("personal-os");
    std::fs::create_dir_all(pack.join("preferences")).unwrap();
    let mut store = Store::load(pack.clone()).unwrap();
    let note = store
        .upsert_note(UpsertInput {
            id: None,
            title: "New Pref".into(),
            shelf: "preferences".into(),
            body: "body".into(),
            tags: None,
            updated: None,
        })
        .unwrap();
    assert!(pack.join(&note.path).is_file());
    assert!(store.delete_note(&note.id).unwrap());
    assert!(!pack.join(&note.path).exists());
}
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/desktop/src-tauri && cargo test -q upsert_creates_file -- --nocapture
```

- [ ] **Step 3: Implement load + fs_write + store**

Load rules (match Node `loadPack`):

- Scan immediate child directories of pack root except `_meta` and hidden names.
- Each shelf: immediate `*.md` files only; parse errors → log to stderr and skip.
- Empty shelf dirs still appear in `list_shelves`.

Upsert:

- Resolve id (new or existing).
- If create: `path = {shelf}/{slug}.md` with `-2`, `-3`, … collision suffix against in-memory paths.
- If update and shelf/title change: write new path, delete old file when path changes.
- Always refresh `updated` unless `UpsertInput.updated` is set.
- `write_note_atomic`: write `{path}.tmp` then rename; then `write_manifest`.

`build_manifest`: same fields as JS `buildManifest`.

- [ ] **Step 4: Run tests — PASS**

```bash
cd apps/desktop/src-tauri && cargo test -q store
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/store.rs apps/desktop/src-tauri/src/fs_write.rs apps/desktop/src-tauri/src/pack/manifest.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Add the in-memory pack store with atomic note writes.

EOF
)"
```

---

### Task 5: LWW sync merge

**Files:**
- Create: `apps/desktop/src-tauri/src/sync.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `Store`, `Note`
- Produces:
  - `pub struct SyncResult { pub notes: Vec<Note>, pub applied: usize, pub kept_server: usize }`
  - `pub fn apply_sync(store: &mut Store, incoming: Vec<Note>) -> Result<SyncResult>`
  - Rule: for each incoming id, if missing on server → upsert with incoming timestamps; if present, keep the side with later `updated` (parse with `chrono::DateTime<Utc>`); if equal, prefer incoming. Server notes not in incoming remain. Return `store.all_notes()`.

- [ ] **Step 1: Write failing test**

```rust
#[test]
fn last_write_wins_by_updated() {
    let dir = tempfile::tempdir().unwrap();
    let pack = dir.path().join("personal-os");
    std::fs::create_dir_all(pack.join("preferences")).unwrap();
    let mut store = Store::load(pack).unwrap();
    let older = store
        .upsert_note(UpsertInput {
            id: Some("note_abc123456789".into()),
            title: "Server".into(),
            shelf: "preferences".into(),
            body: "server".into(),
            tags: None,
            updated: Some("2026-01-01T00:00:00.000Z".into()),
        })
        .unwrap();
    let mut client = older.clone();
    client.title = "Client".into();
    client.body = "client".into();
    client.updated = "2026-02-01T00:00:00.000Z".into();
    let result = apply_sync(&mut store, vec![client]).unwrap();
    let note = store.get_note("note_abc123456789").unwrap();
    assert_eq!(note.title, "Client");
    assert_eq!(result.applied, 1);
}
```

- [ ] **Step 2: Run — FAIL**

```bash
cd apps/desktop/src-tauri && cargo test -q last_write_wins -- --nocapture
```

- [ ] **Step 3: Implement `apply_sync`**

Use store upsert with explicit `updated`. Do not delete server-only notes in this slice (browser merge is additive + LWW updates). Document that deletes while offline require a later explicit delete API call when online.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/sync.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Merge browser note batches with last-write-wins on updated.

EOF
)"
```

---

### Task 6: Localhost HTTP API

**Files:**
- Create: `apps/desktop/src-tauri/src/http.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `Arc<parking_lot::RwLock<Store>>`
- Produces: `pub async fn serve(store: Arc<RwLock<Store>>, addr: SocketAddr) -> Result<()>` where default `addr` is `127.0.0.1:8787`
- Routes:
  - `GET /health` → `{ "ok": true, "notes": <usize> }`
  - `GET /notes` → `{ "notes": Note[] }`
  - `GET /notes/:idOrPath` → note or 404
  - `PUT /notes/:id` → body JSON note fields; upsert; LWW if both have `updated`
  - `POST /sync` → `{ "notes": Note[] }` → `apply_sync` → `{ "notes": Note[], "applied": n, "kept_server": n }`
  - `DELETE /notes/:id` → `{ "ok": true }` or 404
  - `GET /shelves` → `{ "shelves": string[] }`
  - `GET /search?q=&shelf=` → `{ "hits": SearchHit[] }` (+ `hint` when empty)

- [ ] **Step 1: Write failing HTTP integration test**

```rust
#[tokio::test]
async fn health_and_sync_round_trip() {
    // start serve on 127.0.0.1:0, reqwest or hyper client
    // GET /health ok
    // POST /sync with one note
    // GET /notes includes it
}
```

Use `tokio::spawn` + `axum::serve` + `reqwest` (add `reqwest` to dev-dependencies) against ephemeral port.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement Axum router**

- Bind only the address passed in (callers pass `127.0.0.1`).
- CORS: allow `http://localhost:*`, `http://127.0.0.1:*`, and Tauri origins needed for capture hosted on GitHub Pages later — start with reflecting localhost origins via `tower_http::cors::CorsLayer::new().allow_origin(...).allow_methods(...).allow_headers(...)`.
- Shared state: `Arc<RwLock<Store>>`.

- [ ] **Step 4: Run — PASS**

```bash
cd apps/desktop/src-tauri && cargo test -q health_and_sync -- --nocapture
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/http.rs apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Expose the pack store over localhost HTTP for capture sync.

EOF
)"
```

---

### Task 7: MCP stdio tools (read + write)

**Files:**
- Create: `apps/desktop/src-tauri/src/mcp.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/src/bin/personal-os-mcp.rs` (stdio entry Cursor can launch)

**Interfaces:**
- Consumes: shared store API
- Produces: binary `personal-os-mcp` args: `--pack <path>`; tools:
  - `list_shelves`, `search_context`, `get_note`, `reload_pack` (parity with Node)
  - `upsert_note` args `{ id?, title, shelf, body, tags? }` → full Note JSON
  - `delete_note` args `{ idOrPath }` → `{ ok: true }` or error/null per Node style (`get_note` returns null; delete returns `{ ok: false, error: "not_found" }` in JSON text)
- Each tool result: single text content item, `text = serde_json::to_string(value)`

- [ ] **Step 1: Write a smoke test for tool handlers without full MCP wire protocol**

```rust
#[test]
fn upsert_note_handler_writes_pack() {
    // call the same functions mcp handlers call
}
```

Prefer testing thin `handlers` module functions that MCP registers, so tests do not need stdio.

- [ ] **Step 2: Implement `mcp.rs` + bin**

`personal-os-mcp` main:

1. Parse `--pack`.
2. `Store::load`.
3. Wrap `Arc<RwLock<Store>>`.
4. Run `rmcp` stdio server until EOF.

Document Cursor config:

```json
{
  "mcpServers": {
    "personal-os": {
      "command": "/ABS/PATH/to/personal-os-mcp",
      "args": ["--pack", "/ABS/PATH/to/personal-os"]
    }
  }
}
```

- [ ] **Step 3: Manual wire check (required)**

```bash
cd apps/desktop/src-tauri && cargo build --bin personal-os-mcp
# use a minimal MCP inspector or echo initialize only if available;
# otherwise unit-test handlers thoroughly and note manual Cursor check in commit body
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/mcp.rs apps/desktop/src-tauri/src/bin/personal-os-mcp.rs apps/desktop/src-tauri/Cargo.toml
git commit -m "$(cat <<'EOF'
Serve read and write personal-os tools over MCP stdio.

EOF
)"
```

---

### Task 8: File watcher + Tauri host wiring

**Files:**
- Create: `apps/desktop/src-tauri/src/watch.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/index.html`

**Interfaces:**
- Consumes: `Store::reload` or path-level re-parse
- Produces:
  - `pub fn spawn_watcher(pack_root: PathBuf, store: Arc<RwLock<Store>>) -> JoinHandle<()>`
  - Debounce ≥ 200ms; on event, reload pack (full reload acceptable for v1 if partial is harder; prefer full reload first for correctness)
  - Tauri commands: `get_status() -> { pack_path, notes, http_addr }`, `set_pack_path(path: String) -> Result<Status>`
  - On `run()`: resolve default pack dir `~/.personal-os/personal-os` (create empty shelves from default list if missing), spawn HTTP on `127.0.0.1:8787`, spawn watcher; MCP remains the separate `personal-os-mcp` binary for Cursor (do not multiplex stdio with Tauri GUI in one process)

**Default shelves to create if pack missing:** `preferences`, `routines`, `ai-collaboration`, `goals`, `work`, `personal`.

- [ ] **Step 1: Failing test for default pack bootstrap**

```rust
#[test]
fn ensure_pack_creates_default_shelves() {
    let dir = tempfile::tempdir().unwrap();
    let pack = dir.path().join("personal-os");
    ensure_pack_layout(&pack).unwrap();
    assert!(pack.join("preferences").is_dir());
}
```

- [ ] **Step 2: Implement ensure + watcher + Tauri commands; show status in UI**

UI shows pack path, note count, and `http://127.0.0.1:8787/health`.

- [ ] **Step 3: `npm run tauri:dev -w @personal-os/desktop` smoke**

Expected: window opens; `curl -s http://127.0.0.1:8787/health` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop
git commit -m "$(cat <<'EOF'
Wire Tauri host, pack bootstrap, and filesystem reload.

EOF
)"
```

---

### Task 9: Capture companion client + sync

**Files:**
- Create: `apps/capture/src/lib/companionClient.ts`
- Create: `apps/capture/src/lib/companionClient.test.ts`
- Create: `apps/capture/src/lib/companionSync.ts`
- Create: `apps/capture/src/lib/companionSync.test.ts`
- Modify: `apps/capture/src/store/notesStore.ts` (only if a `replaceNotes` caller needs exporting helpers — `replaceNotes` already exists)
- Modify: `apps/capture/src/App.tsx`
- Modify: `apps/capture/src/App.test.tsx`
- Modify: `apps/capture/src/styles.css` (small status chip)

**Interfaces:**
- Consumes: `Note` from pack-core; `loadNotes` / `replaceNotes`
- Produces:
  - `export const DEFAULT_COMPANION_BASE = "http://127.0.0.1:8787"`
  - `export async function fetchCompanionHealth(base?: string): Promise<{ ok: boolean; notes?: number }>`
  - `export async function syncNotesWithCompanion(notes: Note[], base?: string): Promise<Note[]>`
  - `export async function maybeSyncNotes(): Promise<"offline" | "synced">` — health check; if down return offline; else POST `/sync` with `loadNotes()`, `replaceNotes(response.notes)`, return synced

- [ ] **Step 1: Write failing client tests with mocked `fetch`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCompanionHealth, syncNotesWithCompanion } from "./companionClient.js";

afterEach(() => vi.unstubAllGlobals());

it("reports offline when fetch fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
  await expect(fetchCompanionHealth()).rejects.toThrow();
});

it("posts notes to /sync and returns server list", async () => {
  const serverNotes = [
    {
      id: "note_abc123456789",
      title: "T",
      shelf: "preferences",
      tags: [],
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-02-01T00:00:00.000Z",
      body: "b",
      path: "preferences/t.md",
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notes: serverNotes, applied: 1, kept_server: 0 }),
    })
  );
  const out = await syncNotesWithCompanion([]);
  expect(out).toEqual(serverNotes);
  expect(fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:8787/sync",
    expect.objectContaining({ method: "POST" })
  );
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npm exec vitest run src/lib/companionClient.test.ts -w @personal-os/capture
```

- [ ] **Step 3: Implement client + `maybeSyncNotes` + App indicator**

In `App.tsx`: on mount and on `window` `focus`, call `maybeSyncNotes()`; show “Companion online” / “Offline (local only)” text in the top bar. Do not block typing if sync fails.

- [ ] **Step 4: Run capture tests**

```bash
npm exec vitest run src/lib/companionClient.test.ts src/lib/companionSync.test.ts src/App.test.tsx -w @personal-os/capture
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/capture/src/lib/companionClient.ts apps/capture/src/lib/companionClient.test.ts apps/capture/src/lib/companionSync.ts apps/capture/src/lib/companionSync.test.ts apps/capture/src/App.tsx apps/capture/src/App.test.tsx apps/capture/src/styles.css
git commit -m "$(cat <<'EOF'
Sync capture notes with the localhost companion when it is up.

EOF
)"
```

---

### Task 10: Docs + changelog

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/mcp-and-api.md`
- Modify: `docs/development.md`
- Modify: `CHANGELOG.md`
- Create: `apps/desktop/README.md`

**Interfaces:** none

- [ ] **Step 1: Update architecture diagram** to show Tauri companion + browser sync; keep Node plugin path as parallel.

- [ ] **Step 2: Document Rust MCP tools** (`upsert_note`, `delete_note`) and HTTP sync endpoints in `docs/mcp-and-api.md` (new section “Desktop companion”).

- [ ] **Step 3: Add `apps/desktop/README.md`** with `npm run tauri:dev -w @personal-os/desktop`, default pack path, Cursor MCP command example, and `curl` health check.

- [ ] **Step 4: CHANGELOG under Unreleased** — Added desktop companion bullets.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/mcp-and-api.md docs/development.md CHANGELOG.md apps/desktop/README.md
git commit -m "$(cat <<'EOF'
Document the Tauri companion MCP and capture sync path.

EOF
)"
```

- [ ] **Step 6: Ask** whether to update `AGENTS.md` / `docs/agent-kb/` with one sentence about `apps/desktop`.

---

## Spec coverage self-check

| Spec requirement | Task |
| --- | --- |
| Tauri app + Rust core | 1, 8 |
| Pack format parity / fixtures | 2, 4 |
| In-memory index + fast reads | 3, 4 |
| MCP read tools | 7 |
| `upsert_note` / `delete_note` immediate | 7 |
| HTTP localhost API + `/sync` | 6, 5 |
| Offline localStorage + LWW | 5, 9 |
| Watcher / reload | 8 |
| Thin UI | 8 |
| No terminal/skills/Git | (excluded) |
| Docs | 10 |
| Speed targets | 4–8 (architecture); no separate benchmark task — optional `cargo test` timing note in README |

## Placeholder / consistency review

- Types use `Note` / `UpsertInput` / `SyncResult` consistently across tasks 4–7.
- Default HTTP port `8787` and base URL match capture client.
- MCP GUI process split: Tauri does not steal stdio; agents use `personal-os-mcp` binary.
- Offline deletes not auto-propagated in sync (documented in Task 5); acceptable for this slice.
