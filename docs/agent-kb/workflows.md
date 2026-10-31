# Workflows

Step-by-step procedures live in [`docs/development.md`](../development.md). This file is a map of the loops agents hit most often.

## Capture → pack → MCP

Plugin / Node MCP path (no Chit required):

1. Run capture: `npm run dev -w @personal-os/capture`
2. Save notes. **Import PDF** fills the note field from a text-layer PDF; review it, then save. The PDF is not stored, and scanned pages are not read. Details: [`apps/capture/README.md`](../../apps/capture/README.md).
3. **Download pack** saves `personal-os-plugin.zip`. Unzip it. The pack is `plugin/personal-os/` (shelves + `_meta/`). The outer folder is the local marketplace. **Install guide** in the app, and `INSTALL.md` in the zip, cover Claude Code, Cursor, and Codex / ChatGPT desktop. **Import plugin** merges that zip, or an older `personal-os.zip`, after a summary. A pack without `_meta/shelves.json` adds missing shelves only; it does not rename shelves already in the browser.
4. For local development, build and run MCP against a pack path (or use fixtures):

```sh
npm run build -w @personal-os/pack-core
npm run build -w @personal-os/context-mcp
npm run dev -w @personal-os/context-mcp -- --pack ./fixtures/personal-os
```

5. Point the MCP client at the same server + `--pack` path; reload the client after config changes
6. Without Chit, browser storage does not update the unpacked plugin folder — re-export and replace that folder when notes change, then restart or `reload_pack`

Details: root [`README.md`](../../README.md), [`docs/mcp-and-api.md`](../mcp-and-api.md).

## Capture ↔ Chit sync

When Chit is running (`npm run tauri:dev -w @personal-os/desktop` or an installed build):

1. Capture shows **Companion online** when `http://127.0.0.1:8787/health` succeeds; otherwise **Offline (local only)**.
2. On load and window focus, capture `POST`s `localStorage` notes to `/sync` and replaces the browser store with the merged list.
3. Merge is last-write-wins on `updated`. Equal timestamps take the incoming note only when content differs; identical notes are not rewritten. `created` is kept from the first copy stored. Notes only on the companion stay.
4. HTTP sync / PUT / DELETE apply to the on-disk pack immediately and do **not** enter the MCP approval queue. Agent writes via `upsert_note` / `delete_note` stay in `_meta/pending/` until desk **Approve** / **Reject**.
5. Capture deletes send best-effort `DELETE /notes/:id` when Chit is up. A delete while Chit was down is not inferred from a missing id and can return on the next sync — remove it in the desk or with `DELETE /notes/:id`.
6. Zip export remains the plugin install path for `apps/context-mcp`. For Cursor against Chit’s pack, use the desk **Connect MCP** panel (resolved `personal-os-mcp` + pack paths).

Details: [`apps/capture/README.md`](../../apps/capture/README.md#chit-companion-sync), [`apps/desktop/README.md`](../../apps/desktop/README.md), [`docs/mcp-and-api.md`](../mcp-and-api.md#desktop-companion).

## Change the pack contract

1. Start with a failing focused test in `pack-core`
2. Smallest implementation fix; keep browser entry safe (`/parse` and `/node` for gray-matter / `node:*`)
3. Update `fixtures/personal-os` and [`docs/pack-format.md`](../pack-format.md)
4. Note compatibility impact in `CHANGELOG.md`
5. Run pack-core tests, then `npm test` / `npm run build`

Full checklist: [Change the pack contract with TDD](../development.md#change-the-pack-contract-with-tdd).

## Add a default shelf

Custom on-disk shelves need no code. UI defaults require `DEFAULT_SHELVES`, fixture note + manifest, UI confirmation, pack-format/docs/changelog, then full test/build.

Full checklist: [Add a default shelf](../development.md#add-a-default-shelf).

## Add an MCP operation

1. Implement + test in `packService.ts`
2. Register in `mcpTools.ts` (+ tests); add HTTP parity in `httpApi.ts` if intended
3. Update [`docs/mcp-and-api.md`](../mcp-and-api.md) and `apps/context-mcp/README.md`
4. If pack semantics change, update `pack-core` first

Full checklist: [Add an MCP operation](../development.md#add-an-mcp-operation).

## After the work

If the change was substantive, ask before updating agent docs — see [`keeping-docs-current.md`](keeping-docs-current.md).
