# Desktop Desk and Approval Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a React desk in `apps/desktop` for browse/edit/create/delete of pack notes, and route MCP `upsert_note` / `delete_note` through a durable `_meta/pending/` approval queue.

**Architecture:** Rust `PendingQueue` beside `Store`. MCP write handlers enqueue and return `{ pending: true, … }`. Human Tauri commands and HTTP still write the Store immediately. React UI invokes Tauri commands for desk + pending panel.

**Tech Stack:** Existing Tauri 2 + Rust store, React 19 + Vite in `apps/desktop`, Vitest for UI, Cargo tests for queue/MCP.

## Global Constraints

- Pack format version 1 unchanged; pending is only under `_meta/pending/`.
- MCP reads see approved pack only.
- HTTP/capture writes stay immediate.
- No voice/PDF/skills/terminal/Git in this plan.
- Do not edit `AGENTS.md` / `docs/agent-kb/` until asked after the last task.
- Use `CARGO_TARGET_DIR` under `$TMPDIR` on exFAT; ignore `._*` files.

## File structure

| Path | Role |
| --- | --- |
| `apps/desktop/src-tauri/src/pending.rs` | Pending record types, load/save/list/approve/reject |
| `apps/desktop/src-tauri/src/mcp.rs` | Write handlers enqueue; add `list_pending` |
| `apps/desktop/src-tauri/src/bin/personal-os-mcp.rs` | Pass PendingQueue + Store into MCP |
| `apps/desktop/src-tauri/src/lib.rs` | Host holds queue; register Tauri commands |
| `apps/desktop/src/main.tsx` | React entry |
| `apps/desktop/src/App.tsx` | Desk layout |
| `apps/desktop/src/lib/tauriApi.ts` | Typed `invoke` wrappers |
| `apps/desktop/src/components/*` | Shelves, NoteList, NoteEditor, PendingPanel |
| `docs/mcp-and-api.md`, `apps/desktop/README.md`, `CHANGELOG.md` | Document pending MCP + desk |

---

### Task 1: PendingQueue (Rust, TDD)

**Files:**
- Create: `apps/desktop/src-tauri/src/pending.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (`pub mod pending`)

**Interfaces:**
- `PendingOp = Upsert | Delete`
- `PendingRecord { id, op, created_at, source, note: Option<Note>, target_id_or_path: Option<String>, status }`
- `PendingQueue::load(pack_root) -> Self`
- `enqueue_upsert(note_fields) -> PendingRecord`
- `enqueue_delete(id_or_path) -> PendingRecord`
- `list() -> Vec<PendingRecord>`
- `approve(id, &mut Store) -> Result<PendingRecord>`
- `reject(id) -> Result<()>`
- id: `pend_` + 12 hex; files `_meta/pending/<id>.json`

- [ ] **Step 1:** Write failing tests (enqueue, list, approve upsert writes note, reject removes file, approve delete removes note)
- [ ] **Step 2:** `cargo test pending` — expect FAIL
- [ ] **Step 3:** Implement `pending.rs`
- [ ] **Step 4:** Tests PASS
- [ ] **Step 5:** Commit `Add durable MCP pending queue under _meta/pending.`

---

### Task 2: MCP writes enqueue + list_pending

**Files:**
- Modify: `apps/desktop/src-tauri/src/mcp.rs`
- Modify: `apps/desktop/src-tauri/src/bin/personal-os-mcp.rs`
- Modify: Host startup so stdio MCP and Tauri share the same `Arc<RwLock<PendingQueue>>` (or `Arc<Mutex<PendingQueue>>`)

**Interfaces:**
- `handlers::upsert_note` / `delete_note` take queue; return `{ pending: true, id, op, preview }`
- `handlers::list_pending(queue) -> Value`
- Register `list_pending` tool

- [ ] **Step 1:** Failing tests that upsert no longer creates a pack file until approve; return shape has `pending: true`
- [ ] **Step 2:** Implement
- [ ] **Step 3:** Tests PASS; wire bin + Host
- [ ] **Step 4:** Commit `Queue MCP note writes until the human approves.`

---

### Task 3: Tauri commands for desk + pending

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Commands:** `list_shelves`, `list_notes`, `get_note`, `upsert_note`, `delete_note`, `list_pending`, `approve_pending`, `reject_pending` (plus existing status)

- [ ] **Step 1:** Unit-test command helpers or invoke via Host in tests where practical
- [ ] **Step 2:** Register commands; human upsert/delete call Store immediately
- [ ] **Step 3:** Commit `Expose pack CRUD and pending actions as Tauri commands.`

---

### Task 4: React desk scaffold (shelves, list, editor)

**Files:**
- Add React deps to `apps/desktop/package.json` (react, react-dom, @types)
- Create `src/main.tsx`, `App.tsx`, `lib/tauriApi.ts`, components, CSS
- Update `index.html` to mount React
- Vitest config if missing

- [ ] **Step 1:** Tests with mocked `invoke` for list shelves/notes and save
- [ ] **Step 2:** Implement UI
- [ ] **Step 3:** `npm exec vitest run -w @personal-os/desktop` PASS
- [ ] **Step 4:** Commit `Add a React desk UI for browsing and editing pack notes.`

---

### Task 5: Pending panel in the desk

**Files:**
- Create: `PendingPanel.tsx` + test
- Wire into `App.tsx`

- [ ] **Step 1:** Failing test Approve/Reject calls
- [ ] **Step 2:** Implement panel + badge
- [ ] **Step 3:** PASS + commit `Show an approval queue panel in the desktop desk.`

---

### Task 6: Docs

**Files:** `docs/mcp-and-api.md`, `apps/desktop/README.md`, `CHANGELOG.md`

- [ ] Document pending MCP responses and `list_pending`
- [ ] Desk + approve flow in README
- [ ] Changelog Unreleased
- [ ] Commit `Document desktop desk editing and MCP write approval.`
- [ ] Ask whether to update `AGENTS.md` / agent-kb

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| Pending files under `_meta/pending/` | 1 |
| MCP enqueue + pending return | 2 |
| `list_pending` MCP | 2 |
| Human Tauri CRUD immediate | 3–4 |
| Approve/reject | 1, 3, 5 |
| React desk | 4–5 |
| HTTP unchanged | (no code change; verify in Task 2 tests) |
| Docs | 6 |
