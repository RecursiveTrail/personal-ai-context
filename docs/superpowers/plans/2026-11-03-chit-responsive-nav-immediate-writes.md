# Chit Responsive Nav + Immediate MCP Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chit’s desk fill and resize the window with capture-aligned hash routing (Home / Connect MCP), and apply MCP `upsert_note` / `delete_note` to the pack immediately with no approval queue.

**Architecture:** Rust MCP handlers call `Store` directly and drop `PendingQueue`. React uses `HashRouter` (`#/`, `#/connect`) with a capture-style topbar; desk is a full-viewport three-column grid; Connect MCP is a full page. Spec: `docs/superpowers/specs/2026-11-03-chit-responsive-nav-immediate-writes-design.md`.

**Tech Stack:** Tauri 2 + Rust (`apps/desktop/src-tauri`), React 19 + Vitest + `react-router-dom` HashRouter (`apps/desktop/src`).

## Global Constraints

- Hash routes only: `#/` desk, `#/connect` Connect MCP (match capture’s `#/` scheme).
- Capture visual tokens (warm canvas, teal primary, Newsreader + Source Sans 3); no black brand bar.
- Desk is full-window three columns — do **not** apply capture’s centered `1080px` max-width to the desk grid.
- MCP writes apply immediately; no `{ pending: true }`; remove `list_pending` tool and pending UI/commands/module.
- Ignore leftover `_meta/pending/` on disk (no migrate/delete pass).
- Do not edit `AGENTS.md` / `docs/agent-kb/` until asked after the last task.
- Use `CARGO_TARGET_DIR` under `$TMPDIR` on exFAT; ignore `._*` files.

## File structure

| Path | Role |
| --- | --- |
| `apps/desktop/src-tauri/src/mcp.rs` | Immediate upsert/delete handlers; drop pending + `list_pending` |
| `apps/desktop/src-tauri/src/bin/personal-os-mcp.rs` | Construct MCP with store only |
| `apps/desktop/src-tauri/src/lib.rs` | Drop pending field, commands, tests |
| `apps/desktop/src-tauri/src/pending.rs` | **Delete** |
| `apps/desktop/src/lib/tauriApi.ts` | Drop pending types/APIs |
| `apps/desktop/src/components/PendingPanel.tsx` (+ test) | **Delete** |
| `apps/desktop/src/components/ConnectMcp.tsx` (+ test) | Full-page connect UI (no `<details>`, no approval copy) |
| `apps/desktop/src/components/AppShell.tsx` | Topbar + `Outlet` (optional extract; may live in `App.tsx`) |
| `apps/desktop/src/components/Desk.tsx` | Three-column desk (logic from current `App`) |
| `apps/desktop/src/App.tsx` / `main.tsx` | HashRouter routes |
| `apps/desktop/src/App.css` / `index.html` | Capture tokens, fonts, full-height layout |
| `apps/desktop/package.json` | Add `react-router-dom` |
| `apps/desktop/README.md`, `docs/mcp-and-api.md`, `CHANGELOG.md` | Doc updates |

---

### Task 1: MCP handlers write the pack immediately

**Files:**
- Modify: `apps/desktop/src-tauri/src/mcp.rs`
- Modify: `apps/desktop/src-tauri/src/bin/personal-os-mcp.rs`

**Interfaces:**
- Consumes: `SharedStore`, `UpsertInput`, `UpsertNoteArgs`, `DeleteNoteArgs`
- Produces:
  - `handlers::upsert_note(store: &SharedStore, args: UpsertNoteArgs) -> Result<Value, String>` → `json!(note)` after `store.write().upsert_note(...)`
  - `handlers::delete_note(store: &SharedStore, id_or_path: &str) -> Result<Value, String>` → `Ok(json!({ "ok": true }))` / `Ok(json!({ "ok": false }))`; `Err` if `id_or_path.trim().is_empty()` with message `idOrPath must not be empty`
  - Remove `SharedPending`, `queued`, `list_pending` handler, `list_pending` tool
  - `PersonalOsMcp::new(store: SharedStore) -> Self` (no pending)
  - Tool descriptions / `ServerHandler` instructions: no approval language
  - Binary: `PersonalOsMcp::new(store)` only; drop `PendingQueue` import/use

- [ ] **Step 1: Rewrite failing tests** in `mcp.rs` `#[cfg(test)]`

Replace pending-based helpers/tests. Keep `pack()` as `(TempDir, SharedStore)` only. Replace enqueue/approve tests with:

```rust
fn pack() -> (tempfile::TempDir, SharedStore) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("personal-os");
    std::fs::create_dir_all(root.join("preferences")).unwrap();
    let store = Arc::new(RwLock::new(Store::load(root).unwrap()));
    (dir, store)
}

#[test]
fn upsert_note_handler_writes_pack_immediately() {
    let (dir, store) = pack();
    let out = handlers::upsert_note(&store, args("Dark mode")).unwrap();
    assert_eq!(out["title"], "Dark mode");
    assert_eq!(out["shelf"], "preferences");
    assert!(out["id"].as_str().unwrap().starts_with("note_"));
    assert!(dir.path().join("personal-os/preferences/dark-mode.md").exists());
    assert_eq!(store.read().note_count(), 1);
    assert_eq!(handlers::search_context(&store, "dark", None)[0]["id"], out["id"]);
}

#[test]
fn upsert_with_id_updates_and_rejects_invalid() {
    let (_dir, store) = pack();
    let id = seed(&store, "Dark mode");
    let mut update = args("Dark mode");
    update.id = Some(id.clone());
    update.body = "changed".into();
    update.tags = None;
    let out = handlers::upsert_note(&store, update).unwrap();
    assert_eq!(out["body"].as_str().unwrap().trim_end(), "changed");
    assert_eq!(out["tags"], json!(["style"])); // omitted tags keep existing

    let mut bad = args("x");
    bad.shelf = " ".into();
    assert!(handlers::upsert_note(&store, bad).is_err());
    assert!(handlers::upsert_note(&store, args("  ")).is_err());
}

#[test]
fn delete_note_handler_removes_immediately() {
    let (dir, store) = pack();
    let id = seed(&store, "Dark mode");
    assert_eq!(handlers::delete_note(&store, &id).unwrap(), json!({ "ok": true }));
    assert!(!dir.path().join("personal-os/preferences/dark-mode.md").exists());
    assert_eq!(handlers::delete_note(&store, &id).unwrap(), json!({ "ok": false }));
    assert!(handlers::delete_note(&store, "  ").is_err());
}

#[test]
fn handler_error_text_is_json() {
    let (_dir, store) = pack();
    let message = handlers::upsert_note(&store, args("  ")).unwrap_err();
    let result = tool_result(Err(message));
    let wire = serde_json::to_value(&result).unwrap();
    assert_eq!(wire["isError"], true);
    let parsed: Value = serde_json::from_str(wire["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(parsed, json!({"error": "invalid input: title must not be empty"}));
}

#[test]
fn tool_router_exposes_expected_tools() {
    let (_dir, store) = pack();
    let server = PersonalOsMcp::new(store);
    let mut names: Vec<String> = server
        .tool_router
        .list_all()
        .into_iter()
        .map(|t| t.name.to_string())
        .collect();
    names.sort();
    assert_eq!(
        names,
        [
            "delete_note",
            "get_note",
            "list_shelves",
            "reload_pack",
            "search_context",
            "upsert_note"
        ]
    );
}
```

Update `seed` / `read_handlers_match_node_shapes` / `reload_pack_picks_up_external_files` / `text_result_is_single_json_text_item` to use `(dir, store)` only. Delete `approving_a_queued_upsert_applies_it` and any `list_pending` assertions.

- [ ] **Step 2: Run tests to verify they fail**

```sh
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/personal-os-desktop-target}" \
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mcp:: -- --nocapture
```

Expected: FAIL (signature / pending still present / wrong return shapes)

- [ ] **Step 3: Minimal implementation**

In `handlers`:

```rust
pub fn upsert_note(store: &SharedStore, args: UpsertNoteArgs) -> Result<Value, String> {
    let note = store
        .write()
        .upsert_note(UpsertInput {
            id: args.id,
            title: args.title,
            shelf: args.shelf,
            body: args.body,
            tags: args.tags,
            updated: None,
            created: None,
        })
        .map_err(|e| e.to_string())?;
    Ok(json!(note))
}

pub fn delete_note(store: &SharedStore, id_or_path: &str) -> Result<Value, String> {
    if id_or_path.trim().is_empty() {
        return Err("idOrPath must not be empty".into());
    }
    let ok = store
        .write()
        .delete_note(id_or_path)
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": ok }))
}
```

Remove `pending` module imports, `SharedPending`, `queued`, `list_pending`. Change `PersonalOsMcp` to store-only; wire tools to `&self.store`; update descriptions:

- upsert: `"Create or update a context note. Omit id to create; provide an existing id to update. Returns the saved note."`
- delete: `"Delete a context note by id or pack-relative path. Returns {\"ok\":true} when removed, {\"ok\":false} when not found."`
- instructions: `"Personal context pack: search, read, create, update, and delete notes."`

In `personal-os-mcp.rs`:

```rust
let store = Arc::new(RwLock::new(Store::load(pack.clone())?));
let watcher = watch::spawn_watcher(pack.clone(), store.clone());
let service = PersonalOsMcp::new(store).serve(stdio()).await?;
```

Drop `Mutex` / `PendingQueue` imports if unused.

- [ ] **Step 4: Run tests to verify they pass**

```sh
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/personal-os-desktop-target}" \
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mcp:: -- --nocapture
```

Expected: PASS for `mcp::` tests

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/mcp.rs apps/desktop/src-tauri/src/bin/personal-os-mcp.rs
git commit -m "$(cat <<'EOF'
Apply MCP upsert and delete to the pack immediately.

EOF
)"
```

---

### Task 2: Remove pending queue from Host and delete `pending.rs`

**Files:**
- Delete: `apps/desktop/src-tauri/src/pending.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (drop `pub mod pending`, `PendingQueue` field, `list_pending` / `approve_pending` / `reject_pending` commands and Host methods, pending-related tests)
- Grep: ensure no remaining `pending::` imports in `src-tauri`

**Interfaces:**
- Consumes: Task 1’s store-only MCP
- Produces: `Host` without `pending`; no Tauri pending commands; crate builds without `pending.rs`

- [ ] **Step 1: Write / adjust failing Host tests**

In `lib.rs` tests, delete `host_pending_queue_follows_pack_and_http_writes_stay_immediate` and `host_pending_actions_see_records_written_by_another_process` (or rewrite the first to only assert HTTP writes stay immediate without pending). Keep non-pending Host CRUD tests.

If a test still calls `host.pending()` or `list_pending`, change/remove it so the suite expects those APIs gone.

- [ ] **Step 2: Run tests expecting compile/link failure or missing pending APIs**

```sh
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/personal-os-desktop-target}" \
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --nocapture
```

Expected: FAIL or existing pending tests fail once you delete pending tests but code still references pending — proceed to strip.

- [ ] **Step 3: Strip pending from `lib.rs` and delete `pending.rs`**

- Remove `pub mod pending;`
- Remove `pending` field from `Host`; stop loading `PendingQueue` in `start` / `set_pack_path` (or equivalent reload path)
- Remove `pending()`, `list_pending`, `approve_pending`, `reject_pending`, `reload_pending`
- Unregister Tauri commands `list_pending`, `approve_pending`, `reject_pending`
- Delete file `pending.rs`
- `rg 'pending' apps/desktop/src-tauri` — only acceptable hits: comments about ignoring `_meta/`, or unrelated “pending” locals

- [ ] **Step 4: Full Rust test pass**

```sh
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/personal-os-desktop-target}" \
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --nocapture
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add -u apps/desktop/src-tauri
git commit -m "$(cat <<'EOF'
Remove the MCP pending approval queue from the desktop host.

EOF
)"
```

---

### Task 3: Remove PendingPanel and pending client APIs

**Files:**
- Delete: `apps/desktop/src/components/PendingPanel.tsx`
- Delete: `apps/desktop/src/components/PendingPanel.test.tsx`
- Modify: `apps/desktop/src/lib/tauriApi.ts` (remove `PendingRecord`, `listPending`, `approvePending`, `rejectPending`)
- Modify: `apps/desktop/src/App.tsx` (remove PendingPanel import/mount; or defer mount removal to Task 4 if Desk extract happens there — **must** be gone by end of Task 4)
- Modify: `apps/desktop/src/App.test.tsx` (drop `list_pending` mock case)

**Interfaces:**
- Produces: no React references to pending APIs

- [ ] **Step 1: Failing test — PendingPanel absent from desk**

In `App.test.tsx`, add (after router exists this still applies; if App is not routed yet, assert current tree):

```ts
it("does not show pending approval UI", async () => {
  render(<App />);
  await screen.findByText("Morning routine");
  expect(screen.queryByLabelText(/pending approvals/i)).toBeNull();
  expect(screen.queryByText(/pending approval/i)).toBeNull();
});
```

Remove `case "list_pending": return [];` once nothing calls it (or leave until App stops calling — prefer remove with panel).

- [ ] **Step 2: Run**

```sh
npm test -w @personal-os/desktop -- src/App.test.tsx
```

Expected: FAIL on pending still present (or PASS if you remove panel first — prefer fail-first by adding assertion before deletion)

- [ ] **Step 3: Delete panel + API + unmount**

Delete the two PendingPanel files. Strip tauriApi pending exports. Remove `#pending-slot` / `<PendingPanel />` from App (or Desk). Remove pending CSS rules from `App.css` (`.pending*`, `#pending-slot`, `.badge` if unused).

- [ ] **Step 4: Run**

```sh
npm test -w @personal-os/desktop
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -u apps/desktop/src
git commit -m "$(cat <<'EOF'
Remove the pending approval panel from the Chit desk.

EOF
)"
```

---

### Task 4: HashRouter shell, capture-aligned topbar, full-height desk

**Files:**
- Modify: `apps/desktop/package.json` (add `react-router-dom`; run `npm install` from repo root)
- Create or modify: `apps/desktop/src/components/Desk.tsx` (move current desk state/UI from `App.tsx`)
- Modify: `apps/desktop/src/App.tsx` (routes + shell)
- Modify: `apps/desktop/src/main.tsx` (wrap `HashRouter` here **or** inside `App` — pick one place only)
- Modify: `apps/desktop/index.html` (Google Fonts link like capture)
- Modify: `apps/desktop/src/App.css` (capture CSS variables + topbar + full-height desk)
- Modify: `apps/desktop/src/App.test.tsx` (render with `HashRouter` / `MemoryRouter`; navigation tests)

**Interfaces:**
- Routes: `path: "/"` → `<Desk />`; `path: "/connect"` → `<ConnectMcp />` (Connect page body may still be stub until Task 5; can render existing ConnectMcp temporarily)
- Shell: brand **Chit** + tagline; `brandHome` → `/`; nav **Home** (`/`), **Connect MCP** (`/connect`); `NavLink` or buttons with `isActive`
- CSS variables (copy from capture `:root` light theme): `--canvas`, `--surface`, `--ink`, `--primary`, `--font-display`, `--font-ui`, etc.
- Layout:

```css
html, body, #root { height: 100%; }
.app-shell { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.desk { flex: 1; min-height: 0; display: grid; grid-template-columns: 180px 280px 1fr; }
```

- [ ] **Step 1: Add dependency**

```sh
npm install react-router-dom -w @personal-os/desktop
```

- [ ] **Step 2: Write failing navigation tests** in `App.test.tsx`

```tsx
import { MemoryRouter } from "react-router-dom";
// render helper:
function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

it("navigates to Connect MCP and Home", async () => {
  renderApp("/");
  await screen.findByText("Morning routine");
  fireEvent.click(screen.getByRole("link", { name: "Connect MCP" })); // or button if using navigate+button
  expect(await screen.findByText(/point cursor at this pack/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Home" }));
  expect(await screen.findByText("Morning routine")).toBeTruthy();
});

it("brand home returns to the desk", async () => {
  renderApp("/connect");
  fireEvent.click(screen.getByRole("button", { name: "Home" })); // brandHome aria-label Home
  expect(await screen.findByText("Morning routine")).toBeTruthy();
});
```

If using `NavLink`, role is `link`. Match whatever the implementation uses (prefer `NavLink` for Home/Connect; `button.brandHome` for brand like capture).

Drop `list_pending` from mocks if still present. Mock `mcp_connect_info` for connect page.

- [ ] **Step 3: Run tests — expect FAIL**

```sh
npm test -w @personal-os/desktop -- src/App.test.tsx
```

Expected: FAIL (no router / no nav links)

- [ ] **Step 4: Implement shell + Desk extract + CSS**

`App.tsx` sketch:

```tsx
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { ConnectMcp } from "./components/ConnectMcp";
import { Desk } from "./components/Desk";

export function App() {
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbarInner">
          <div className="brand">
            <h1>Chit</h1>
            <p className="tagline">
              The local consciousness layer and MCP runtime for personal AI agents.
            </p>
            <button
              type="button"
              className="brandHome"
              aria-label="Home"
              onClick={() => navigate("/")}
            />
          </div>
          <nav className="deskNav" aria-label="Desk">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "isActive" : "")}>
              Home
            </NavLink>
            <NavLink to="/connect" className={({ isActive }) => (isActive ? "isActive" : "")}>
              Connect MCP
            </NavLink>
          </nav>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Desk />} />
        <Route path="/connect" element={<ConnectMcp />} />
      </Routes>
    </div>
  );
}
```

`main.tsx`:

```tsx
import { HashRouter } from "react-router-dom";
createRoot(...).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
```

Move shelf/note/editor state from current `App` into `Desk.tsx` (same behavior). `index.html`: add Newsreader + Source Sans 3 `<link>`s like capture. Restyle `App.css` with capture tokens; style `.topbar`, `.brand`, `.deskNav`, `.brandHome`; remove old `.brand` black bar and `.connect-mcp` strip styles (Connect page styles in Task 5).

- [ ] **Step 5: Run tests**

```sh
npm test -w @personal-os/desktop
```

Expected: PASS (Connect page may still be `<details>` until Task 5 — then adjust the “point cursor” assertion to match visible lead text, expanding details in test if needed, **or** finish Task 5 in the same session before claiming green)

Prefer completing Task 5 before considering Task 4 done if tests require the page form.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json package-lock.json apps/desktop/src apps/desktop/index.html
git commit -m "$(cat <<'EOF'
Add HashRouter shell and capture-aligned Chit topbar.

EOF
)"
```

---

### Task 5: Connect MCP full page (no approval copy)

**Files:**
- Modify: `apps/desktop/src/components/ConnectMcp.tsx`
- Modify: `apps/desktop/src/components/ConnectMcp.test.tsx`
- Modify: `apps/desktop/src/App.css` (`.connect-page` centered content)

**Interfaces:**
- Page (not `<details>`): heading optional; lead “Point Cursor at this pack via MCP.”; `<pre>` snippet; Copy button; errors via `role="alert"`; **no** Approve/pending sentence
- Centered: `width: min(40rem, calc(100% - 64px)); margin: 0 auto; padding: …`

- [ ] **Step 1: Rewrite ConnectMcp tests**

```tsx
it("shows snippet and Copy without approval copy", async () => {
  invoke.mockResolvedValue({
    mcpBinary: "/Apps/Chit.app/Contents/MacOS/personal-os-mcp",
    packPath: "/Users/me/.personal-os/personal-os",
  });
  render(<ConnectMcp />);
  expect(await screen.findByText(/point cursor at this pack/i)).toBeTruthy();
  expect(screen.getByText(/personal-os-mcp/)).toBeTruthy();
  expect(screen.queryByText(/Approve/i)).toBeNull();
  expect(screen.queryByText(/pending/i)).toBeNull();
  expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
});
```

Keep Copy + error tests; remove expand/`details` expectations.

- [ ] **Step 2: Run — expect FAIL**

```sh
npm test -w @personal-os/desktop -- src/components/ConnectMcp.test.tsx
```

- [ ] **Step 3: Implement page UI**

Replace `<details>` with:

```tsx
return (
  <section className="connect-page" aria-label="Connect MCP">
    <p className="connect-lead">Point Cursor at this pack via MCP.</p>
    {error ? <p role="alert" className="error">{error}</p> : null}
    {info ? (
      <>
        <pre className="connect-snippet">{snippet}</pre>
        <div className="connect-actions">
          <button type="button" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </>
    ) : null}
  </section>
);
```

- [ ] **Step 4: Run all desktop frontend tests**

```sh
npm test -w @personal-os/desktop
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/ConnectMcp.tsx apps/desktop/src/components/ConnectMcp.test.tsx apps/desktop/src/App.css
git commit -m "$(cat <<'EOF'
Make Connect MCP a full page without approval copy.

EOF
)"
```

---

### Task 6: Docs — README, MCP API, changelog

**Files:**
- Modify: `apps/desktop/README.md` (Desk sections: nav routes; remove Pending approval; MCP writes immediate; Connect is `#/connect`)
- Modify: `docs/mcp-and-api.md` desktop companion section (immediate writes; drop `list_pending` / pending shapes)
- Modify: `CHANGELOG.md` (Unreleased: nav + immediate MCP writes + removed approval)

**Interfaces:** none (docs only)

- [ ] **Step 1: Update README Desk + Cursor MCP sections**

Replace “four regions” / pending approval with three columns + header nav. Document `#/` and `#/connect`. State MCP upsert/delete apply immediately and return note / `{ ok }`. Remove approve/reject instructions.

- [ ] **Step 2: Update `docs/mcp-and-api.md`**

Desktop companion: remove pending queue paragraphs and `list_pending` row; document immediate write return shapes per Task 1.

- [ ] **Step 3: CHANGELOG Unreleased bullet**

Example:

```md
- Chit: capture-aligned Home / Connect MCP hash routes, full-window desk layout, and immediate MCP writes (approval queue removed).
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/README.md docs/mcp-and-api.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
Document immediate MCP writes and Chit hash navigation.

EOF
)"
```

- [ ] **Step 5: Stop for doc hygiene ask**

Propose (do not apply until user says yes): short updates to `AGENTS.md` / `docs/agent-kb/` that still say MCP writes wait for desk Approve.

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| HashRouter `#/` + `#/connect` | 4 |
| Capture topbar / brandHome / deskNav | 4 |
| Capture visual tokens + fonts | 4 |
| Full-viewport three-column desk | 4 |
| Connect full page + Copy, no approval copy | 5 |
| MCP immediate upsert/delete return shapes | 1 |
| Remove list_pending / pending module / Tauri pending cmds | 1–2 |
| Remove PendingPanel | 3 |
| Ignore leftover `_meta/pending/` | (no code; docs note optional) |
| Docs README + mcp-and-api + CHANGELOG | 6 |
| Do not silently edit AGENTS/agent-kb | 6 Step 5 |

## Plan self-review

- No TBD/placeholder steps; commands and expected outcomes included.
- Handler signatures in Task 1 match binary + tests in later steps.
- Delete return `{ ok: bool }` consistent across Task 1 and Task 6 docs.
- Frontend tests use `MemoryRouter` while production uses `HashRouter` in `main.tsx`.
