# Plugin bundle and import

Date: 2026-10-21

Download pack becomes one zip that Claude Code, Cursor, and Codex / ChatGPT desktop can load as a local plugin. The zip contains the version 1 note pack, shelf details, one skill, and a built-in context server. Import reads that zip, or today’s pack-only zip, back into the capture desk after a confirmed merge.

## Decisions

- The assistant uses the notes through the bundled MCP server. One skill tells it to call `list_shelves`, `search_context`, and `get_note` on the server named `personal-os`. The notes stay files under `personal-os/`.
- One zip, `personal-os-plugin.zip`, unzips to a folder named `personal-os-plugin`. The inner `plugin/` directory is the plugin. The outer folder is the local marketplace for Claude Code and Codex.
- The capture app shows an Install guide at `#/install`. The zip includes the same steps in `INSTALL.md`. The browser does not install the plugin into Claude Code, Cursor, or Codex.
- Codex and the ChatGPT desktop app are in this version, for local threads only. The public plugin directory, cloud chats, and the Codex IDE extension are out of scope. Those surfaces cannot start the local Node server.
- Import shows a summary, then merges by note id after confirmation. Notes that exist only in this browser stay. Cancel writes nothing.
- The pack contract stays version 1. Shelf name, description, color, order, and default flag travel in `_meta/shelves.json`. The current loader skips `_meta`, so existing readers keep working.
- The computer that runs the assistant needs Node.js 20 or newer.

## Bundle layout

```text
personal-os-plugin/
├── .agents/plugins/marketplace.json
├── .claude-plugin/marketplace.json
├── INSTALL.md
└── plugin/
    ├── plugin.json
    ├── mcp.json
    ├── .claude-plugin/plugin.json
    ├── .mcp.json
    ├── .cursor-plugin/plugin.json
    ├── cursor-mcp.json
    ├── skills/use-personal-context/SKILL.md
    ├── server/server.js
    └── personal-os/
        ├── <shelf-slug>/
        │   └── <note>.md
        └── _meta/
            ├── manifest.json
            └── shelves.json
```

`personal-os/` follows [pack-format.md](../../pack-format.md). Note files, frontmatter, and `manifest.json` stay as they are today. Every shelf in `shelves.json` gets a directory, including a shelf with no notes, so `list_shelves` can see it.

The plugin version in the manifests is `1.0.0`. That number is the plugin package version. It is separate from pack `version: 1`.

## Host manifests

All three manifests start the same server and the same pack. Each file uses the path variable that host expands.

Claude Code, `plugin/.mcp.json`:

```json
{
  "mcpServers": {
    "personal-os": {
      "command": "node",
      "args": [
        "${CLAUDE_PLUGIN_ROOT}/server/server.js",
        "--pack",
        "${CLAUDE_PLUGIN_ROOT}/personal-os"
      ]
    }
  }
}
```

`plugin/.claude-plugin/plugin.json` names the plugin `personal-os`, version `1.0.0`, with a short description that this plugin serves the user’s personal notes.

Cursor, `plugin/.cursor-plugin/plugin.json`, sets `mcpServers` to `./cursor-mcp.json` so Cursor does not read the Codex `mcp.json`. `plugin/cursor-mcp.json` uses `${CURSOR_PLUGIN_ROOT}` in the same `command` and `args` positions.

Codex / ChatGPT, `plugin/plugin.json`, is an Agent Plugins manifest with schema `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`, name `personal-os`, version `1.0.0`. `plugin/mcp.json` uses schema `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`, server type `stdio`, and `${PLUGIN_ROOT}` in the same argument positions. No authentication block is required.

Outer `.claude-plugin/marketplace.json`:

```json
{
  "name": "personal-os",
  "owner": { "name": "Personal OS" },
  "plugins": [
    {
      "name": "personal-os",
      "source": "./plugin",
      "description": "Personal context notes with a local MCP server"
    }
  ]
}
```

Outer `.agents/plugins/marketplace.json`:

```json
{
  "name": "personal-os",
  "interface": { "displayName": "Personal OS" },
  "plugins": [
    {
      "name": "personal-os",
      "source": { "source": "local", "path": "./plugin" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

## Skill

`plugin/skills/use-personal-context/SKILL.md` has frontmatter `name: use-personal-context` and a description that says to search the user’s Personal OS notes for preferences, routines, goals, and collaboration rules before answering from personal context.

The body tells the assistant to use the `personal-os` MCP tools, in this order when it needs personal context:

1. `list_shelves`
2. `search_context` with a query and an optional shelf
3. `get_note` with an id or a pack-relative path

It tells the assistant to quote only the note that applies, and to treat `capture:*` tags as provenance. The same file is the skill for all three hosts.

## Server bundle

`apps/context-mcp` gains a bundle script that writes one ECMAScript module, with a `#!/usr/bin/env node` line, to `apps/capture/src/generated/plugin-server.js`. The capture build and the capture tests generate that file first. The download copies its text to `plugin/server/server.js`.

`resolvePackPath` keeps today’s order: `--pack`, then `PERSONAL_OS_PACK_PATH`. If neither is set, and a `personal-os` directory exists beside the server file’s parent (`plugin/personal-os` when the file is `plugin/server/server.js`), the server uses that directory. If that directory is absent, the server still exits with the current message: `Set PERSONAL_OS_PACK_PATH or pass --pack /path/to/personal-os`. The repository development server keeps requiring an explicit pack path.

The bundled server is the existing stdio server. The plugin manifests do not pass `--http`.

## Shelf file

`_meta/shelves.json`:

```json
{
  "version": 1,
  "shelves": [
    {
      "slug": "preferences",
      "name": "Preferences",
      "description": "How you like things done.",
      "color": "#0f6e6e",
      "order": 1,
      "isDefault": true
    }
  ]
}
```

`pack-core` parses and serializes this file on the browser-safe entry. A shelf is valid when slug, name, and description are non-empty strings, color is `#` plus six hex digits, order is a finite number, and `isDefault` is a boolean. Invalid JSON, a missing `shelves` array, or an invalid shelf rejects the file. The MCP loader does not read it.

Download writes one entry per shelf in browser storage, using the shelf’s slug, name, description, color, order, and `isDefault`.

## Download

The desk menu label stays **Download pack**. The subtitle becomes **Downloads personal-os-plugin.zip**.

The builder reads `loadNotes()` and `loadShelves()`, writes each note with the existing serializer, writes `manifest.json` and `shelves.json`, writes a directory for every shelf, and adds the server text, skill, manifests, marketplace files, and `INSTALL.md`. A desk with no notes still downloads a plugin whose shelf directories may be empty.

If the generated server file is missing, download throws and the desk shows **Download failed. Try again.** No zip is saved.

## Import

The desk menu gains **Import plugin**. Choosing it opens a file picker for a `.zip`. The preview is read-only until confirmation.

The importer looks for `plugin/personal-os/` first, then `personal-os/`. Either match is the pack root. A zip with neither shows **This file is not a Personal OS plugin or pack.** and does not open the summary.

Notes are parsed with the existing Markdown parser. A file that fails to parse is skipped. When two files share a note id, the first file in zip entry order is kept and the later file is skipped. Skipped files add to **Could not read N files.** If the pack has note files and every one fails, Confirm stays unavailable.

`shelves.json` is optional. When it is missing or invalid, shelves come from the note parent folders and from any empty shelf directories. Each of those shelves uses the slug as its name and as its description, color `#0f6e6e`, order by slug, and `isDefault: true` only for the built-in slugs `preferences`, `routines`, `ai-collaboration`, `goals`, `work`, and `personal`. The summary then says shelf details were filled in from the folders.

A valid `shelves.json` is the source for those shelves. A note or directory whose slug is missing from that file still adds a folder-derived shelf, using the same fallback fields.

The summary counts:

- **Added** — the id is in the plugin and not in this browser.
- **Updated** — the id is in both, and title, body, shelf, path, or the set of tags differ. Tag order does not matter.
- **Unchanged** — the id is in both and those fields match.
- **Left as they are** — the id exists only in this browser.
- **Shelves added** and **Shelves updated** — a shelf slug is new, or its name, description, color, or order differs. Color comparisons ignore case.
- **Could not read N files** — omitted when N is 0.

Confirm is available when at least one note would be added or updated, or at least one shelf would be added or updated. When nothing would change, the summary says this browser already has these notes, and Confirm stays unavailable.

Confirm writes added notes and replaces updated notes with the parsed file, including `created` and `updated` from that file. Browser-only notes stay. Shelf slugs from the plugin are added or updated. A built-in slug stays `isDefault: true`. Browser-only shelves stay. Cancel writes nothing.

Confirm builds the next note list and the next shelf list in memory, writes notes once, then writes shelves once. If the notes write throws, the browser ledger is unchanged. If the shelves write throws after the notes write succeeds, the notes stay updated and the shelves stay as they were. The desk shows the existing storage-full message. The preview is not shown again unless the user picks the file again.

## Install guide

**Install guide** in the desk menu opens `#/install`. The page and `INSTALL.md` use the same steps.

1. Unzip `personal-os-plugin.zip`.
2. Install Node.js 20 or newer on the computer that runs the assistant.
3. Claude Code: from a shell, `claude plugin marketplace add /absolute/path/to/personal-os-plugin`, then `claude plugin install personal-os@personal-os`. Start a new session and ask it to search your notes.
4. Cursor: copy the inner `plugin` folder to `~/.cursor/plugins/local/personal-os`, so `.cursor-plugin/plugin.json` is directly inside that folder. Reload the window. Local plugin imports must be allowed.
5. Codex / ChatGPT desktop: `codex plugin marketplace add /absolute/path/to/personal-os-plugin`, then install Personal OS from that marketplace in the ChatGPT desktop app or Codex CLI. Use a local thread. Cloud chats and the Codex IDE extension do not run this server.

The page does not detect whether those apps or Node are installed.

## Error handling

| Situation | Result |
| --- | --- |
| Download while the server bundle is missing | Banner **Download failed. Try again.** No file is saved. |
| Desk has no notes | A valid plugin downloads, with shelf directories and no note files. |
| Import file is not a zip, or the zip has no pack root | **This file is not a Personal OS plugin or pack.** |
| Some note files fail to parse, or repeat an id | Those files are skipped and counted. The rest can be confirmed. |
| Every note file fails | Summary opens. Confirm stays unavailable. |
| `shelves.json` missing or invalid | Folder-derived shelves. The summary says so. |
| Nothing to add or update | Confirm stays unavailable. |
| Confirm, then storage is full | Existing storage-full message. |
| Cancel | Browser ledger unchanged. |

## Testing

Automated Vitest coverage:

- Shelves file round-trip, and rejection of an invalid file.
- Plugin zip paths: both marketplace files, `INSTALL.md`, the inner manifests, the skill, `server/server.js`, shelf directories, `manifest.json`, and `shelves.json`. Each manifest uses that host’s path variable.
- Import counts for added, updated, unchanged, and browser-only notes. Skip a bad note. Keep the first of a duplicate id. Open a pack-only zip. Reject a zip with no pack. Fall back when `shelves.json` is missing.
- Confirm writes added and updated notes and shelves. Cancel writes nothing. Confirm stays unavailable when nothing changes or every note failed.
- Omitting `--pack` uses a sibling `personal-os` directory when it exists, and keeps the current error when it does not. `--pack` still wins.

Browser check before the UI is called done: download a plugin, open the install guide, and run import through the summary, confirm, and cancel.

Manual check on a machine with Node 20: unzip a download and load it in Claude Code, Cursor, and the ChatGPT desktop app or Codex CLI, then ask each assistant to search the notes. The test suite does not launch those apps.

## Out of scope

Publishing to the Cursor marketplace or the OpenAI plugin directory. Cloud or hosted note storage. Automatic install into an assistant. Watching the plugin folder and refreshing it after a later download. Embeddings. Changing note frontmatter or pack `version`.

## Docs during implementation

Update [pack-format.md](../../pack-format.md) with optional `_meta/shelves.json`, and update the capture and context-server readmes, the architecture page, and the changelog so download and install match this bundle. Ask before editing `AGENTS.md` or `docs/agent-kb/`.
