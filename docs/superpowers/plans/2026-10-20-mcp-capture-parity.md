# MCP capture parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the context MCP/HTTP server into intentional parity with the capture desk without breaking the local-first, read-only pack contract.

**Architecture:** Capture remains the writer; the unpacked `personal-os/` pack remains the contract; MCP remains a thin read-only adapter over `packService`. Parity work updates shelf discovery, optional pack reload, agent-facing docs/tests, and deliberately skips browser-only capture chrome.

**Tech Stack:** TypeScript, Vitest, `@personal-os/pack-core`, MCP SDK, existing `packService` / `mcpTools` / `httpApi`

## Global Constraints

- Keep MCP/HTTP read-only in this plan (no note create/update/delete through the server).
- Do not put shelf description/color, LLM settings, or IndexedDB into the pack.
- Keep `@personal-os/pack-core` browser-safe entry points free of `node:*`.
- Pack format stays version 1; additive shelves and tags only.
- Preserve existing tool names `list_shelves`, `search_context`, `get_note`.

---

## Verdict: what does and does not need MCP changes

### Already fine (no MCP feature work required)

| Capture change | Why MCP is fine |
| --- | --- |
| Shelves hub / shelf detail UI | Browser chrome only |
| Quick capture, PDF import, Audio Capture page | Capture-only input paths; export still writes Markdown notes |
| Dictation keep-alive | Browser Web Speech only |
| Custom shelf description/color | Stored in `personal-os.shelves.v1`, intentionally not in the zip |
| LLM settings modal | Browser BYOK only |
| `capture:*` tags on notes | Already valid pack tags; `get_note` returns them |

### Real parity gaps

1. **Empty shelves:** Capture shows `work` / `personal` even with zero notes. MCP `list_shelves` only returns shelves that currently have notes.
2. **Pack refresh friction:** Capture can re-export a zip; MCP still requires a process restart. `packService.reload()` exists but is not exposed.
3. **Agent docs / tests lag:** Architecture still describes the old single-page capture form; MCP tests barely assert the new default shelves.
4. **Optional agent ergonomics:** `capture:` tags can confuse search/system prompts unless documented (or optionally filtered later).

### Explicitly out of scope for this plan

- Writing notes through MCP
- Syncing LLM keys or shelf colors into the pack
- Prompt-assembly / “system prompt injection” tool
- Semantic search / embeddings
- Auto-watching the pack directory

---

## File map

| File | Responsibility |
| --- | --- |
| `packages/pack-core/src/loadPack.ts` | Discover empty shelf directories as well as note-bearing shelves |
| `packages/pack-core/src/loadPack.test.ts` | Prove empty dirs appear in shelf listing |
| `apps/context-mcp/src/packService.ts` | Expose reload + richer shelf listing |
| `apps/context-mcp/src/mcpTools.ts` | Register `reload_pack`; tighten tool descriptions |
| `apps/context-mcp/src/httpApi.ts` | `POST /reload` (or `GET /reload` if POST is blocked by current GET-only policy — prefer extending methods carefully) |
| `apps/context-mcp/src/*.test.ts` | Cover work/personal, empty shelves, reload |
| `docs/mcp-and-api.md`, `docs/architecture.md`, `apps/context-mcp/README.md`, `CHANGELOG.md` | Document new behavior and capture→MCP workflow |

---

### Task 1: List empty on-disk shelves

**Files:**
- Modify: `packages/pack-core/src/loadPack.ts`
- Modify: `packages/pack-core/src/loadPack.test.ts`
- Modify: `apps/context-mcp/src/packService.ts` (if API signature changes)
- Test: `packages/pack-core/src/loadPack.test.ts`

- [x] **Step 1: Write the failing test**

Add a temp-pack test that creates `work/` with no `.md` files and a note under `preferences/`. Assert shelf listing includes both `preferences` and `work`.

```ts
expect(listShelvesFromPack(notes, packDir)).toEqual(
  expect.arrayContaining(["preferences", "work"])
);
```

Prefer extending the Node loader API rather than inventing a second discovery path in MCP.

Recommended shape:

```ts
export async function listShelfDirs(packDir: string): Promise<string[]>;
export function listShelves(notes: Note[], shelfDirs?: string[]): string[];
```

`listShelves(notes, shelfDirs)` unions note shelves with directory names, sorts, and de-dupes. Keep the old `listShelves(notes)` behavior when `shelfDirs` is omitted so current callers do not break silently—or update every caller in the same change set.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @personal-os/pack-core -- src/loadPack.test.ts`

Expected: FAIL because empty directories are ignored today.

- [ ] **Step 3: Implement minimal shelf-dir discovery**

In `loadPack.ts`, while scanning pack directories, collect directory names even when they contain no `.md` files. Export them from `loadPackFromDir` or a sibling helper, then union into `listShelves`.

- [ ] **Step 4: Wire packService**

```ts
listShelves: (): string[] => listShelves(notes, shelfDirs),
```

Ensure `reload()` refreshes both notes and shelfDirs.

- [ ] **Step 5: Run tests**

Run: `npm test -w @personal-os/pack-core -w @personal-os/context-mcp`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/pack-core apps/context-mcp
git commit -m "$(cat <<'EOF'
List empty pack shelves so MCP matches the capture desk.

EOF
)"
```

---

### Task 2: Expose pack reload to MCP and HTTP

**Files:**
- Modify: `apps/context-mcp/src/mcpTools.ts`
- Modify: `apps/context-mcp/src/httpApi.ts`
- Modify: `apps/context-mcp/src/mcpTools.test.ts`
- Modify: `apps/context-mcp/src/httpApi.test.ts`
- Modify: `docs/mcp-and-api.md`

- [ ] **Step 1: Decide HTTP method**

Current HTTP API accepts GET only and returns 405 otherwise. Prefer adding `POST /reload` and allowing POST for that path only, rather than overloading GET. Document the exception.

- [ ] **Step 2: Write failing MCP test**

Create a temp pack, start the service, add a note file, call `reload_pack`, assert `list_shelves` / `get_note` see the new note without recreating the service.

- [ ] **Step 3: Write failing HTTP test**

`POST /reload` returns `{ "ok": true, "notes": N, "shelves": [...] }` after files change.

- [ ] **Step 4: Implement**

```ts
server.registerTool(
  "reload_pack",
  {
    description:
      "Re-read the configured personal-os pack from disk after the user replaces exported files",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    await service.reload();
    return textResult({
      ok: true,
      notes: /* count */,
      shelves: service.listShelves(),
    });
  }
);
```

Keep annotations honest: reload rereads disk but does not mutate pack files.

- [ ] **Step 5: Update docs**

In `docs/mcp-and-api.md` troubleshooting, replace “restart the process” as the only option with: re-export zip → replace unpacked dir → call `reload_pack` or `POST /reload` (restart still works).

- [ ] **Step 6: Run tests and commit**

```bash
npm test -w @personal-os/context-mcp
git add apps/context-mcp docs/mcp-and-api.md
git commit -m "$(cat <<'EOF'
Expose pack reload so agents can pick up a fresh export without restarting.

EOF
)"
```

---

### Task 3: Assert new default shelves and clarify capture tags

**Files:**
- Modify: `apps/context-mcp/src/mcpTools.test.ts`
- Modify: `apps/context-mcp/src/packService.test.ts`
- Modify: `apps/context-mcp/src/mcpTools.ts` (tool descriptions only)
- Modify: `docs/mcp-and-api.md`
- Modify: `docs/architecture.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Strengthen fixture assertions**

```ts
expect(await callJson("list_shelves", {})).toEqual([
  "ai-collaboration",
  "goals",
  "personal",
  "preferences",
  "routines",
  "work",
]);
```

- [ ] **Step 2: Document `capture:` tags for agents**

In `docs/mcp-and-api.md`, add a short note:

> Capture may store `capture:text`, `capture:voice`, `capture:pdf`, or `capture:clipboard` in `tags`. Treat these as provenance, not user preferences.

Optionally tighten `search_context` description the same way. Do **not** strip tags from `get_note` in this plan.

- [ ] **Step 3: Refresh architecture capture flow**

Update `docs/architecture.md` capture section so it describes the shelves desk, quick capture title derivation, PDF import, and zip export, instead of the old title/shelf form.

- [ ] **Step 4: Changelog**

Under `[Unreleased]`, document empty-shelf listing and `reload_pack` / `POST /reload`.

- [ ] **Step 5: Full verification**

```bash
npm test
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add apps/context-mcp docs CHANGELOG.md
git commit -m "$(cat <<'EOF'
Document capture/MCP parity for new shelves, reload, and capture tags.

EOF
)"
```

---

### Task 4: Manual smoke (after code lands)

- [ ] Export a pack from capture that includes a note on `work` and an empty `personal` folder if custom export creates empty dirs—or create empty `personal/` on disk.
- [ ] Point MCP at the unpacked pack.
- [ ] Call `list_shelves` and confirm `work` / `personal` appear as designed.
- [ ] Replace a note file, call `reload_pack`, confirm without restarting Node.
- [ ] Search `shelf=work` and `get_note` for a work note.

---

## Recommended sequencing

1. Task 1 first (shelf discovery) — largest user-visible MCP parity gap with the new defaults.
2. Task 2 next (reload) — biggest workflow improvement after capture export.
3. Task 3 last (docs/tests) — locks the contract in writing.

## What not to build yet

If a later plan wants deeper parity, candidates are:

- `get_shelf` returning note summaries for one shelf
- A read-only `compose_brief` that concatenates selected shelves for system prompts
- Optional FS watch + auto-reload

None of those are required for the capture desk changes already shipped.
