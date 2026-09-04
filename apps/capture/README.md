# Personal OS Capture

React/Vite browser app for creating, editing, deleting, and exporting Personal OS notes. Version 1 has no backend: the browser profile is the working store.

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

The app does not upload or synchronize this data. Changing browser, profile, hostname, port, or clearing site data can expose a different/empty store. Invalid JSON at the key is removed and treated as an empty library. If a storage write fails, the UI asks the user to download the pack and delete old notes.

The create/edit UI offers the four `DEFAULT_SHELVES`: `preferences`, `routines`, `ai-collaboration`, and `goals`. It does not currently edit tags, although the shared note model and exported format support them.

## Speech-to-text caveats

The Record control uses the browser's `SpeechRecognition` or prefixed `webkitSpeechRecognition`; support varies by browser and platform. Recognition generally requires localhost or HTTPS and microphone permission, and the browser vendor may determine whether transcription is on-device or uses a service.

Unsupported recognition, denied permission, or microphone errors leave the title/body form usable for typing and pasting. Treat the transcript as draft text and review it before saving.

## Export flow

1. Save and review notes in the local library.
2. Choose **Download pack**.
3. The app rebuilds all notes as Markdown, builds a version 1 manifest, and downloads `personal-os.zip`.
4. Unzip it. The archive's top-level `personal-os/` directory contains shelf folders and `_meta/manifest.json`.
5. Point the context server at that directory, not at the zip or its parent.

Exports are snapshots. After changing browser notes, download again, replace the unpacked directory, and restart the MCP process. See the [pack contract](../../docs/pack-format.md) and [MCP/API guide](../../docs/mcp-and-api.md).
