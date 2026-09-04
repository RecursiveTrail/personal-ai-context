# `@personal-os/pack-core`

Shared version 1 pack contract and utilities for browser and Node consumers.

## Entry points

### `@personal-os/pack-core`

Browser-safe public entry point. It exports:

- Constants: `DEFAULT_SHELVES`, `META_DIR`, `PACK_ROOT_NAME`
- Types: `DefaultShelf`, `NoteFrontmatter`, `Note`, `ManifestEntry`, `Manifest`, `SearchHit`
- Note helpers: `newNoteId`, `slugifyTitle`, `serializeNote`
- Manifest helper: `buildManifest`
- Search helper: `searchNotes`

```ts
import {
  DEFAULT_SHELVES,
  buildManifest,
  searchNotes,
  serializeNote,
  type Note,
} from "@personal-os/pack-core";
```

This entry point does not import `gray-matter`, so it is safe to include in
browser bundles.

### `@personal-os/pack-core/parse`

Exports `parseNoteMarkdown`. This parser depends on `gray-matter`; import it
only in Node or other environments that need to parse pack Markdown.

```ts
import { parseNoteMarkdown } from "@personal-os/pack-core/parse";
```

### `@personal-os/pack-core/node`

Re-exports the browser-safe entry point and parser, and additionally exports:

- `loadPackFromDir(packDir)` — scans immediate shelf directories, parses direct `.md` children, skips `_meta` and dot-prefixed directories, and returns `{ notes, errors }`.
- `listShelves(notes)` — returns unique frontmatter shelf values sorted alphabetically.

```ts
import {
  listShelves,
  loadPackFromDir,
} from "@personal-os/pack-core/node";
```

Do not import `@personal-os/pack-core/node` from browser code. It imports `node:fs/promises` and `node:path`; using it in capture or another browser bundle can fail the build or pull Node-only code into the client.

## Behavioral notes

- `parseNoteMarkdown` requires non-empty `id`, `title`, `shelf`, `created`, and `updated`; missing tags become an empty array.
- `serializeNote` emits YAML frontmatter and a trimmed Markdown body with a final newline.
- `newNoteId` requires a modern runtime with `crypto.randomUUID` (Node.js 20+ or a current browser).
- `searchNotes` optionally filters by exact shelf, uses deterministic keyword scoring, and returns excerpts of at most 160 characters. Blank queries list all notes in scope; non-blank queries that contain no searchable tokens return no results.
- `buildManifest` always emits `{ version: 1, notes: [...] }`.

See the repository [pack format contract](../../docs/pack-format.md) and [development guide](../../docs/development.md).

## Commands

```sh
npm test -w @personal-os/pack-core
npm run build -w @personal-os/pack-core
```
