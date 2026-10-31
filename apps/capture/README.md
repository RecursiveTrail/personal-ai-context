# Personal OS Capture

React/Vite browser app for creating, editing, deleting, and exporting Personal OS notes. Version 1 stays local-first: the browser profile is the working store. When [Chit](../desktop/README.md) is running, capture also syncs that store to the on-disk pack over localhost.

## Run locally

From the repository root with Node.js 20+:

```sh
npm install
npm run dev -w @personal-os/capture
```

Use the URL printed by Vite. Other commands:

```sh
npm test -w @personal-os/capture
npm run build -w @personal-os/capture
npm run preview -w @personal-os/capture
```

## Storage

Notes are serialized as a `Note[]` in origin-scoped `localStorage` under the exact key:

```text
personal-os.notes.v1
```

Changing browser, profile, hostname, port, or clearing site data can expose a different/empty store. Invalid JSON at the key is removed and treated as an empty library. If a storage write fails, the UI asks the user to download the pack and delete old notes.

The desk offers the default shelves `preferences`, `routines`, `ai-collaboration`, `goals`, `work`, and `personal`, plus any custom shelves created in this browser. It does not currently edit tags, although the shared note model and exported format support them.

## Chit companion sync

When Chit is up, the header shows **Companion online**; otherwise **Offline (local only)**. Capture talks only to `http://127.0.0.1:8787` (see [apps/desktop/README.md](../desktop/README.md)).

- On load and whenever the window gains focus, capture checks `/health`, then `POST`s the browser notes to `/sync` and replaces `localStorage` with the merged list the companion returns.
- Merge is last-write-wins on each note’s `updated` timestamp. Equal timestamps take the incoming note only when content differs; identical notes are not rewritten. `created` is kept from the first copy stored. Notes that exist only on the companion stay.
- HTTP sync writes apply immediately on disk and do **not** enter Chit’s MCP approval queue.
- Deleting a note in capture also sends a best-effort `DELETE /notes/:id` when the companion is reachable. A delete made while Chit was down is not inferred from a missing id and the note can return on the next sync — remove it in the Chit desk or with `DELETE /notes/:id` once the companion is up.
- Zip export remains the plugin install path for Claude Code, Cursor, and Codex / ChatGPT desktop (`apps/context-mcp`). Companion sync does not replace that flow.

## Speech-to-text caveats

The Record control uses the browser's `SpeechRecognition` or prefixed `webkitSpeechRecognition`; support varies by browser and platform. Recognition generally requires localhost or HTTPS and microphone permission, and the browser vendor may determine whether transcription is on-device or uses a service.

Unsupported recognition, denied permission, or microphone errors leave the title/body form usable for typing and pasting. Treat the transcript as draft text and review it before saving.

## PDF import

**Import PDF** reads a text-layer PDF in the browser and replaces the note field with the extracted text. Pages are separated by a blank line. The title and shelf stay as they are, and the note is not saved until **Save**. The original PDF is not stored.

A file that is not a readable PDF, a PDF with no selectable text, or a file larger than 20 MB shows an error and leaves the note field unchanged. Scanned pages are not read.

## Export flow

1. Save and review notes in the local library.
2. Choose **Download pack**.
3. The app rebuilds all notes as Markdown, builds a version 1 manifest, and downloads `personal-os-plugin.zip`. It also writes optional shelf metadata to `_meta/shelves.json`.
4. Unzip it. The inner `plugin/personal-os` directory is the pack: it contains shelf folders, `_meta/manifest.json`, and `_meta/shelves.json`. The install guide in the app and `INSTALL.md` explain Claude Code, Cursor, and Codex / ChatGPT desktop.
5. Point a manually configured context server at `plugin/personal-os`, not at the zip or its parent.

**Import plugin** merges `personal-os-plugin.zip`, or an older `personal-os.zip`, into the browser library after showing a summary you can confirm or cancel.

Exports are snapshots. After changing browser notes, download again, replace the unpacked directory, and restart the MCP process. See the [pack contract](../../docs/pack-format.md) and [MCP/API guide](../../docs/mcp-and-api.md).
