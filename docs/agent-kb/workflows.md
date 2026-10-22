# Workflows

Step-by-step procedures live in [`docs/development.md`](../development.md). This file is a map of the loops agents hit most often.

## Capture → pack → MCP

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
6. V1 does not sync browser storage to disk automatically — re-export and replace the unpacked folder when notes change

Details: root [`README.md`](../../README.md), [`docs/mcp-and-api.md`](../mcp-and-api.md).

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
