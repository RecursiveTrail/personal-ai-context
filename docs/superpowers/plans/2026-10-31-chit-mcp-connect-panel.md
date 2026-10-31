# Chit MCP Connect Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsed **Connect MCP** panel under Chit’s brand header that shows a Cursor-ready JSON snippet with resolved `personal-os-mcp` and pack paths, plus Copy and an approval reminder.

**Architecture:** Pure Rust helper resolves sibling `personal-os-mcp` from an exe directory and pairs it with `Host` pack path; exposed as Tauri `mcp_connect_info`. React `ConnectMcp` panel loads that info, builds Cursor JSON, and copies to clipboard. Spec: `docs/superpowers/specs/2026-10-31-chit-mcp-connect-panel-design.md`.

**Tech Stack:** Tauri 2 + Rust (`apps/desktop/src-tauri`), React 19 + Vitest (`apps/desktop/src`).

## Global Constraints

- Cursor JSON only (no Claude Code / Codex snippets).
- Collapsed by default under the brand header.
- Do not invent paths: missing sibling binary → `Err(String)`; UI shows error and disables Copy.
- No writing Cursor config to disk; no pack-path editing in this panel.
- Do not edit `AGENTS.md` / `docs/agent-kb/` until asked after the last task.
- Use `CARGO_TARGET_DIR` under `$TMPDIR` on exFAT; ignore `._*` files.

## File structure

| Path | Role |
| --- | --- |
| `apps/desktop/src-tauri/src/mcp_connect.rs` | `McpConnectInfo` + `resolve_mcp_connect_info(exe_dir, pack_path)` |
| `apps/desktop/src-tauri/src/lib.rs` | `pub mod mcp_connect`; command `mcp_connect_info`; register handler |
| `apps/desktop/src/lib/tauriApi.ts` | `McpConnectInfo` type + `mcpConnectInfo()` invoke |
| `apps/desktop/src/lib/cursorMcpSnippet.ts` | Build Cursor JSON string from info |
| `apps/desktop/src/components/ConnectMcp.tsx` | Collapsible panel UI |
| `apps/desktop/src/components/ConnectMcp.test.tsx` | Panel tests |
| `apps/desktop/src/App.tsx` / `App.css` | Mount panel under brand header; styles |
| `apps/desktop/README.md`, `CHANGELOG.md` | Docs |

---

### Task 1: Resolve MCP connect info (Rust, TDD)

**Files:**
- Create: `apps/desktop/src-tauri/src/mcp_connect.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (`pub mod mcp_connect`; command + handler registration)

**Interfaces:**
- Consumes: `Host::status().pack_path`; `std::env::current_exe()` only inside the Tauri command wrapper
- Produces:
  - `pub struct McpConnectInfo { pub mcp_binary: String, pub pack_path: String }` (serde rename camelCase: `mcpBinary`, `packPath`)
  - `pub fn resolve_mcp_connect_info(exe_dir: &Path, pack_path: &str) -> Result<McpConnectInfo, String>`
  - Binary name: `personal-os-mcp` on Unix; `personal-os-mcp.exe` on Windows (`#[cfg(windows)]`)
  - Success: absolute path to existing file (canonicalize when `canonicalize` succeeds; otherwise join display)
  - Failure: `Err(format!("personal-os-mcp not found at {}", candidate.display()))` when file missing
  - `#[tauri::command] async fn mcp_connect_info(host: State<'_, Host>) -> Result<McpConnectInfo, String>` calls helper with `current_exe()?.parent()` and `host.status().pack_path`

- [ ] **Step 1: Write the failing tests** in `mcp_connect.rs` under `#[cfg(test)]`

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn resolves_when_sibling_binary_exists() {
        let dir = tempdir().unwrap();
        let name = mcp_binary_name();
        let bin = dir.path().join(name);
        fs::write(&bin, b"x").unwrap();
        let info = resolve_mcp_connect_info(dir.path(), "/tmp/pack").unwrap();
        assert!(info.mcp_binary.ends_with(name) || info.mcp_binary.contains(name));
        assert!(Path::new(&info.mcp_binary).is_file());
        assert_eq!(info.pack_path, "/tmp/pack");
    }

    #[test]
    fn errors_when_sibling_missing() {
        let dir = tempdir().unwrap();
        let err = resolve_mcp_connect_info(dir.path(), "/tmp/pack").unwrap_err();
        assert!(err.contains("personal-os-mcp"));
        assert!(err.contains("not found"));
    }
}
```

Add `fn mcp_binary_name() -> &'static str` in the same module (cfg-gated) so tests and resolve share one name.

- [ ] **Step 2: Run test to verify it fails**

```sh
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-${TMPDIR:-/tmp}/personal-os-desktop-target}" \
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml mcp_connect -- --nocapture
```

Expected: FAIL (module / function not found)

- [ ] **Step 3: Write minimal implementation**

Create `mcp_connect.rs` with `McpConnectInfo`, `mcp_binary_name`, `resolve_mcp_connect_info`. In `lib.rs`: `pub mod mcp_connect;`, import `McpConnectInfo`, add command:

```rust
#[tauri::command]
async fn mcp_connect_info(host: State<'_, Host>) -> Result<mcp_connect::McpConnectInfo, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or_else(|| "cannot resolve executable directory".to_string())?;
    mcp_connect::resolve_mcp_connect_info(dir, &host.status().pack_path)
}
```

Register `mcp_connect_info` in `generate_handler![...]`.

- [ ] **Step 4: Run tests and make sure they pass**

Same `cargo test … mcp_connect` command. Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/mcp_connect.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
Expose mcp_connect_info with a resolved sibling MCP binary path.

EOF
)"
```

---

### Task 2: ConnectMcp React panel (TDD)

**Files:**
- Create: `apps/desktop/src/lib/cursorMcpSnippet.ts`
- Create: `apps/desktop/src/components/ConnectMcp.tsx`
- Create: `apps/desktop/src/components/ConnectMcp.test.tsx`
- Modify: `apps/desktop/src/lib/tauriApi.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.css`

**Interfaces:**
- Consumes: `invoke("mcp_connect_info")` → `{ mcpBinary: string, packPath: string }`
- Produces:
  - `export type McpConnectInfo = { mcpBinary: string; packPath: string }`
  - `export const mcpConnectInfo = () => invoke<McpConnectInfo>("mcp_connect_info")`
  - `export function cursorMcpSnippet(info: McpConnectInfo): string` — pretty-printed JSON of:

```json
{
  "mcpServers": {
    "personal-os": {
      "command": "<mcpBinary>",
      "args": ["--pack", "<packPath>"]
    }
  }
}
```

  - `<ConnectMcp />` — no props; loads on mount

- [ ] **Step 1: Write failing UI tests** in `ConnectMcp.test.tsx`

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { ConnectMcp } from "./ConnectMcp";

beforeEach(() => {
  invoke.mockReset();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(() => cleanup());

it("is collapsed by default and shows snippet after expand when info loads", async () => {
  invoke.mockResolvedValue({
    mcpBinary: "/Apps/Chit.app/Contents/MacOS/personal-os-mcp",
    packPath: "/Users/me/.personal-os/personal-os",
  });
  render(<ConnectMcp />);
  const details = screen.getByText("Connect MCP").closest("details");
  expect(details).not.toBeNull();
  expect((details as HTMLDetailsElement).open).toBe(false);
  fireEvent.click(screen.getByText("Connect MCP"));
  (details as HTMLDetailsElement).open = true;
  fireEvent.toggle(details!);
  await waitFor(() => {
    expect(screen.getByText(/personal-os-mcp/)).toBeTruthy();
    expect(screen.getByText(/Approve/i)).toBeTruthy();
  });
});

it("copies JSON on Copy", async () => {
  invoke.mockResolvedValue({
    mcpBinary: "/bin/personal-os-mcp",
    packPath: "/pack",
  });
  render(<ConnectMcp />);
  const details = screen.getByText("Connect MCP").closest("details")!;
  details.open = true;
  fireEvent.toggle(details);
  const copy = await screen.findByRole("button", { name: /copy/i });
  fireEvent.click(copy);
  await waitFor(() => {
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    const arg = (navigator.clipboard.writeText as any).mock.calls[0][0] as string;
    expect(arg).toContain("mcpServers");
    expect(arg).toContain("/bin/personal-os-mcp");
    expect(arg).toContain("/pack");
  });
});

it("shows error and no Copy when invoke fails", async () => {
  invoke.mockRejectedValue("personal-os-mcp not found at /x/personal-os-mcp");
  render(<ConnectMcp />);
  const details = screen.getByText("Connect MCP").closest("details")!;
  details.open = true;
  fireEvent.toggle(details);
  await waitFor(() => {
    expect(screen.getByRole("alert").textContent).toMatch(/not found/i);
  });
  expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
});
```

Also add a tiny unit test file or same file for `cursorMcpSnippet` if imported separately — optional if the Copy test covers the string.

- [ ] **Step 2: Run tests to verify they fail**

```sh
cd apps/desktop && npx vitest run src/components/ConnectMcp.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

1. `tauriApi.ts` — add `McpConnectInfo` + `mcpConnectInfo`.
2. `cursorMcpSnippet.ts` — `JSON.stringify({ mcpServers: { "personal-os": { command: info.mcpBinary, args: ["--pack", info.packPath] } } }, null, 2)`.
3. `ConnectMcp.tsx`:
   - `<details className="connect-mcp">` with `<summary>Connect MCP</summary>`
   - Lead: “Point Cursor at this pack via MCP.”
   - On mount call `mcpConnectInfo()`; store info / error
   - On success: `<pre>` with snippet; button **Copy** → `navigator.clipboard.writeText(snippet)`
   - Approval line: “MCP writes stay pending until you Approve them in the desk.”
   - On error: `<p role="alert">…</p>`; no Copy button
4. `App.tsx`: after `</header>`, render `<ConnectMcp />` (still inside `app-shell`, above `.desk`).
5. `App.css`: style `.connect-mcp` under brand (dark bar continuation or light strip with border-bottom matching desk); keep summary readable; `<pre>` monospace, scrollable, max-height ~12rem.

- [ ] **Step 4: Run tests — PASS**

```sh
cd apps/desktop && npx vitest run src/components/ConnectMcp.test.tsx src/App.test.tsx
```

Expected: all PASS. If `App.test` breaks on new markup, adjust queries only as needed without removing coverage.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/tauriApi.ts apps/desktop/src/lib/cursorMcpSnippet.ts \
  apps/desktop/src/components/ConnectMcp.tsx apps/desktop/src/components/ConnectMcp.test.tsx \
  apps/desktop/src/App.tsx apps/desktop/src/App.css
git commit -m "$(cat <<'EOF'
Add a Connect MCP panel with copyable Cursor config.

EOF
)"
```

---

### Task 3: Docs

**Files:**
- Modify: `apps/desktop/README.md` (Cursor MCP section)
- Modify: `CHANGELOG.md` (Unreleased → Added)

**Interfaces:** none

- [ ] **Step 1: Update README**

In `## Cursor MCP`, add after the intro paragraph (before the JSON example):

> Chit also shows this snippet under **Connect MCP** in the window header (paths filled for this install).

Keep the existing manual JSON example.

- [ ] **Step 2: Update CHANGELOG**

Under `### Added`:

```markdown
- Chit **Connect MCP** panel: collapsed under the brand header; copy Cursor `mcpServers` JSON with resolved `personal-os-mcp` and pack paths; notes that MCP writes need desk Approve.
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/README.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
Document the in-app Connect MCP panel.

EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| Collapsible under brand, collapsed default | Task 2 |
| Cursor JSON only + Copy + Approve note | Task 2 |
| Resolve sibling binary + pack path | Task 1 |
| Err when binary missing; no fake path | Task 1 + Task 2 error UI |
| README + CHANGELOG | Task 3 |
| Out of scope (other clients, write config) | Not in plan |
