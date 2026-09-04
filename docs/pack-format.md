# Pack format

The pack is the portable contract between capture, storage or sync mechanisms, and agent-facing readers. Version 1 is a directory named `personal-os` containing shelf directories, Markdown notes, and metadata.

## Layout

```text
personal-os/
├── preferences/
│   └── prefer-short-answers.md
├── routines/
│   └── morning-routine.md
├── ai-collaboration/
│   └── confirm-before-push.md
├── goals/
│   └── ship-v1.md
└── _meta/
    └── manifest.json
```

The Node loader scans only immediate, non-hidden top-level directories other than `_meta`, and only immediate files ending in `.md` within each directory. Nested shelf directories are not scanned. Note paths use forward slashes and are relative to `personal-os/`.

## Note contract

Every note is UTF-8 Markdown with YAML frontmatter followed by a prose body.

| Field | Type | Version 1 rule |
| --- | --- | --- |
| `id` | string | Required, non-empty, and stable for the note's lifetime. Capture generates `note_` plus 12 UUID-derived hex characters. IDs should be unique in a pack. |
| `title` | string | Required and non-empty. A short human- and agent-readable label. |
| `shelf` | string | Required and non-empty. Must match the note's parent directory for a valid pack. The current loader trusts this field and does not reject a mismatch. |
| `tags` | string array | Optional when hand-authoring; missing becomes `[]`, and a scalar is normalized to a one-item array. Serialization always writes an array. |
| `created` | string | Required, non-empty ISO 8601 timestamp. |
| `updated` | string | Required, non-empty ISO 8601 timestamp; change it whenever note content or metadata changes. |

The in-memory `Note` also has `body` and `path`. They are derived from the Markdown content and filesystem location, not additional frontmatter fields.

### Complete example

```markdown
---
id: note_pref_short
title: "Prefer short answers"
shelf: preferences
tags:
  - "style"
created: 2026-09-04T10:00:00.000Z
updated: 2026-09-04T10:00:00.000Z
---

I prefer concise bullet answers over long essays.
```

Prefer atomic notes: put one durable preference, routine, goal, or collaboration rule in each file. Atomic notes produce focused search excerpts, can be updated without rewriting unrelated context, and give agents a precise unit to quote.

## Manifest contract

`_meta/manifest.json` has this version 1 shape:

```json
{
  "version": 1,
  "notes": [
    {
      "id": "note_pref_short",
      "path": "preferences/prefer-short-answers.md",
      "shelf": "preferences",
      "title": "Prefer short answers",
      "updated": "2026-09-04T10:00:00.000Z"
    }
  ]
}
```

`notes` is an array with one entry per note. Each entry repeats the note's `id`, pack-relative `path`, `shelf`, `title`, and `updated` value. Capture rebuilds this file during every export. The shipped Node loader scans directories and currently neither reads nor validates the manifest, but other consumers may rely on it as an inventory.

## Adding a custom shelf

1. Choose a lowercase, filesystem-safe name such as `reading-notes`; do not use `_meta`, a dot-prefixed name, or a slash.
2. Create `personal-os/reading-notes/`.
3. Place `.md` notes directly inside it and set each note's `shelf: reading-notes`.
4. Add matching entries to `_meta/manifest.json` if hand-authoring. Capture exports regenerate the manifest.
5. Validate by starting the context server and checking `list_shelves` or `GET /shelves`.

The loader supports custom shelves without code changes. The capture form only offers `DEFAULT_SHELVES`, so making a custom shelf selectable there requires a product/code change described in [development.md](development.md#add-a-default-shelf).

## Versioning and compatibility

The manifest `version` identifies the pack contract, not an application release.

- Keep `version: 1` for additive custom shelves, new notes, reordered manifest entries, new tags, changed bodies, or optional metadata that version 1 readers can safely ignore.
- Keep stable IDs when renaming, moving, or editing a note; update `path`, `shelf`, `title`, and `updated` in the manifest as applicable.
- Bump the version only for a breaking contract change, such as removing or changing the meaning/type of a required field, changing path/layout rules, or requiring readers to interpret note bodies differently.
- Before introducing version 2, update types, parser/serializer, exporter, loader, fixtures, MCP behavior if affected, and this document. Decide explicitly whether readers reject, migrate, or support both versions.

Adding unknown JSON or frontmatter fields is structurally backward compatible with the shipped parser, which ignores them. Consumers outside this repository may be stricter, so document additions and test representative packs.
