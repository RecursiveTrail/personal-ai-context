# Plugin bundle and import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download pack produces `personal-os-plugin.zip`, a local plugin for Claude Code, Cursor, and Codex / ChatGPT desktop, and Import plugin merges that zip back into the desk after a confirmed summary.

**Architecture:** `pack-core` owns `_meta/shelves.json`. `context-mcp` bundles one Node server and, when `--pack` and `PERSONAL_OS_PACK_PATH` are absent, reads `personal-os/` beside that server. The capture app wraps the version 1 pack with plugin manifests, one skill, and that server, then previews and merges the same zip by note id.

**Tech Stack:** TypeScript, Vitest, JSZip, esbuild, Vite, React, existing `@personal-os/pack-core` parse/serialize and `@personal-os/context-mcp` stdio server.

## Global Constraints

- The assistant uses the notes through the bundled MCP server. One skill tells it to call `list_shelves`, `search_context`, and `get_note` on the server named `personal-os`. The notes stay files under `personal-os/`.
- One zip, `personal-os-plugin.zip`, unzips to a folder named `personal-os-plugin`. The inner `plugin/` directory is the plugin. The outer folder is the local marketplace for Claude Code and Codex.
- The capture app shows an Install guide at `#/install`. The zip includes the same steps in `INSTALL.md`. The browser does not install the plugin into Claude Code, Cursor, or Codex.
- Codex and the ChatGPT desktop app are in this version, for local threads only. The public plugin directory, cloud chats, and the Codex IDE extension are out of scope.
- Import shows a summary, then merges by note id after confirmation. Notes that exist only in this browser stay. Cancel writes nothing.
- The pack contract stays version 1. Shelf name, description, color, order, and default flag travel in `_meta/shelves.json`. The current loader skips `_meta`.
- The computer that runs the assistant needs Node.js 20 or newer.
- Spec: `docs/superpowers/specs/2026-10-21-plugin-bundle-design.md`.

---

## File structure

- `packages/pack-core/src/shelves.ts` — parse and serialize `_meta/shelves.json`. Browser-safe. Exported from `src/index.ts`.
- `apps/context-mcp/src/config.ts` — `--pack`, then `PERSONAL_OS_PACK_PATH`, then a sibling `personal-os` directory.
- `apps/context-mcp/scripts/bundle-plugin.mjs` — esbuild writes `apps/capture/src/generated/plugin-server.js`.
- `apps/capture/src/lib/pluginFiles.ts` — manifest JSON, skill markdown, and `INSTALL.md` text.
- `apps/capture/src/lib/exportZip.ts` — `buildPluginZip` writes the full archive.
- `apps/capture/src/lib/importPlugin.ts` — find the pack in a zip, preview counts, pure merge.
- `apps/capture/src/store/notesStore.ts` — `replaceNotes` writes the note list once.
- `apps/capture/src/store/shelvesStore.ts` — `saveShelves` writes shelves once; `loadShelves` keeps a stored default shelf's name and order.
- `apps/capture/src/components/InstallGuide.tsx` — `#/install` page using the same steps as `INSTALL.md`.
- `apps/capture/src/App.tsx` — menu entries, import summary modal, install route.
- Docs in Task 9: `docs/pack-format.md`, `apps/capture/README.md`, `apps/context-mcp/README.md`, `docs/architecture.md`, `docs/development.md`, `CHANGELOG.md`.

Do not edit `AGENTS.md` or `docs/agent-kb/` in these tasks. After Task 9, ask whether to add a short plugin-zip note there.

---

### Task 1: Shelf metadata file

**Files:**
- Create: `packages/pack-core/src/shelves.ts`
- Create: `packages/pack-core/src/shelves.test.ts`
- Modify: `packages/pack-core/src/index.ts`

**Interfaces:**
- Consumes: nothing from later tasks
- Produces: `PackShelf`, `ShelvesFile`, `serializeShelves(shelves: PackShelf[]): string`, `parseShelves(json: string): PackShelf[]`

- [ ] **Step 1: Write the failing test**

Create `packages/pack-core/src/shelves.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseShelves, serializeShelves, type PackShelf } from "./shelves.js";

const shelf: PackShelf = {
  slug: "preferences",
  name: "Preferences",
  description: "How you like things done.",
  color: "#0f6e6e",
  order: 1,
  isDefault: true,
};

describe("shelves file", () => {
  it("round-trips a shelf list", () => {
    const parsed = parseShelves(serializeShelves([shelf]));
    expect(parsed).toEqual([shelf]);
  });

  it("rejects an invalid file", () => {
    expect(() => parseShelves("{")).toThrow(/invalid shelves file/i);
    expect(() => parseShelves('{"version":1}')).toThrow(/invalid shelves file/i);
    expect(() =>
      parseShelves(
        JSON.stringify({
          version: 1,
          shelves: [{ ...shelf, color: "teal" }],
        })
      )
    ).toThrow(/invalid shelves file/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @personal-os/pack-core -- src/shelves.test.ts`

Expected: FAIL because `./shelves.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `packages/pack-core/src/shelves.ts`:

```typescript
export type PackShelf = {
  slug: string;
  name: string;
  description: string;
  color: string;
  order: number;
  isDefault: boolean;
};

export type ShelvesFile = {
  version: 1;
  shelves: PackShelf[];
};

const COLOR = /^#[0-9a-fA-F]{6}$/;

function isShelf(value: unknown): value is PackShelf {
  if (!value || typeof value !== "object") return false;
  const shelf = value as Partial<PackShelf>;
  return (
    typeof shelf.slug === "string" &&
    shelf.slug.trim() !== "" &&
    typeof shelf.name === "string" &&
    shelf.name.trim() !== "" &&
    typeof shelf.description === "string" &&
    shelf.description.trim() !== "" &&
    typeof shelf.color === "string" &&
    COLOR.test(shelf.color) &&
    typeof shelf.order === "number" &&
    Number.isFinite(shelf.order) &&
    typeof shelf.isDefault === "boolean"
  );
}

export function serializeShelves(shelves: PackShelf[]): string {
  const file: ShelvesFile = {
    version: 1,
    shelves: [...shelves].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)),
  };
  return JSON.stringify(file, null, 2);
}

export function parseShelves(json: string): PackShelf[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid shelves file");
  }
  if (!parsed || typeof parsed !== "object" || !("shelves" in parsed)) {
    throw new Error("Invalid shelves file");
  }
  const shelves = (parsed as { shelves?: unknown }).shelves;
  if (!Array.isArray(shelves) || !shelves.every(isShelf)) {
    throw new Error("Invalid shelves file");
  }
  return shelves;
}
```

Add this line to `packages/pack-core/src/index.ts`:

```typescript
export * from "./shelves.js";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @personal-os/pack-core -- src/shelves.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/pack-core/src/shelves.ts packages/pack-core/src/shelves.test.ts packages/pack-core/src/index.ts
git commit -m "$(cat <<'EOF'
Add a shelves file so desk names and colors can travel with a pack.

EOF
)"
```

---

### Task 2: Sibling pack path

**Files:**
- Modify: `apps/context-mcp/src/config.ts`
- Modify: `apps/context-mcp/src/config.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `resolvePackPath(argv, env, options?)` where `options` is `{ serverFile?: string; directoryExists?: (dir: string) => boolean }`. Return order stays `--pack`, then `PERSONAL_OS_PACK_PATH`, then `<server parent>/personal-os` when that directory exists.

- [ ] **Step 1: Write the failing test**

Add this import and test to `apps/context-mcp/src/config.test.ts`. Keep the existing tests.

```typescript
import path from "node:path";
```

```typescript
  it("uses personal-os beside the server when that directory exists", () => {
    expect(
      resolvePackPath(["node", "server.js"], {}, {
        serverFile: "/plugin/server/server.js",
        directoryExists: (dir) => dir === path.join("/plugin", "personal-os"),
      })
    ).toBe(path.join("/plugin", "personal-os"));
  });

  it("keeps the missing-path error when the sibling directory is absent", () => {
    expect(() =>
      resolvePackPath(["node", "server.js"], {}, {
        serverFile: "/plugin/server/server.js",
        directoryExists: () => false,
      })
    ).toThrow("Set PERSONAL_OS_PACK_PATH or pass --pack");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @personal-os/context-mcp -- src/config.test.ts`

Expected: FAIL because `resolvePackPath` does not accept the third argument and still throws when no flag or env is set.

- [ ] **Step 3: Write the implementation**

Replace `apps/context-mcp/src/config.ts` with:

```typescript
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MISSING_PACK =
  "Set PERSONAL_OS_PACK_PATH or pass --pack /path/to/personal-os";

export function resolvePackPath(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  options: {
    serverFile?: string;
    directoryExists?: (dir: string) => boolean;
  } = {}
): string {
  const flagIndex = argv.indexOf("--pack");
  if (flagIndex >= 0 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  if (env.PERSONAL_OS_PACK_PATH) return env.PERSONAL_OS_PACK_PATH;

  const serverFile = options.serverFile ?? fileURLToPath(import.meta.url);
  const sibling = path.join(path.dirname(serverFile), "..", "personal-os");
  const directoryExists = options.directoryExists ?? existsSync;
  if (directoryExists(sibling)) return sibling;
  throw new Error(MISSING_PACK);
}

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return port;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @personal-os/context-mcp -- src/config.test.ts`

Expected: PASS, including the existing `--pack` and env tests.

- [ ] **Step 5: Commit**

```bash
git add apps/context-mcp/src/config.ts apps/context-mcp/src/config.test.ts
git commit -m "$(cat <<'EOF'
Let the context server find a pack folder shipped beside it.

EOF
)"
```

---

### Task 3: Bundle the context server

**Files:**
- Create: `apps/context-mcp/scripts/bundle-plugin.mjs`
- Create: `apps/context-mcp/src/bundlePlugin.test.ts`
- Modify: `apps/context-mcp/package.json`
- Modify: `package.json` root `build` script
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `apps/context-mcp/src/server.ts`
- Produces: `apps/capture/src/generated/plugin-server.js`, one ESM file whose first line is `#!/usr/bin/env node`. The capture app imports it as raw text. The file is generated and gitignored.

- [ ] **Step 1: Write the failing test**

Create `apps/context-mcp/src/bundlePlugin.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plugin server bundle", () => {
  it("starts with a node shebang and carries the server", () => {
    const source = readFileSync(
      new URL("../../capture/src/generated/plugin-server.js", import.meta.url),
      "utf8"
    );
    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(source).toContain("personal-os");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @personal-os/context-mcp -- src/bundlePlugin.test.ts`

Expected: FAIL because the generated file is missing.

- [ ] **Step 3: Write the bundle script and wire it into the builds**

Run: `npm install -D esbuild -w @personal-os/context-mcp`

Create `apps/context-mcp/scripts/bundle-plugin.mjs`:

```javascript
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const outfile = path.resolve(
  here,
  "../../capture/src/generated/plugin-server.js"
);

mkdirSync(path.dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: [path.resolve(here, "../src/server.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
```

In `apps/context-mcp/package.json`, add the script and make test generate the file first:

```json
"bundle-plugin": "node scripts/bundle-plugin.mjs",
"pretest": "npm run bundle-plugin",
```

Leave the existing `"test": "vitest run"`.

In the root `package.json`, replace the build script so pack-core exists before the bundle runs:

```json
"build": "npm run build -w @personal-os/pack-core && npm run bundle-plugin -w @personal-os/context-mcp && npm run build -w @personal-os/context-mcp && npm run build -w @personal-os/capture"
```

Append to `.gitignore`:

```text
apps/capture/src/generated/
```

In `apps/capture/package.json`, prefix build and test so a capture-only command still has the server file:

```json
"build": "npm run bundle-plugin -w @personal-os/context-mcp && tsc -b && vite build",
"test": "npm run bundle-plugin -w @personal-os/context-mcp && vitest run"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run build -w @personal-os/pack-core && npm test -w @personal-os/context-mcp -- src/bundlePlugin.test.ts`

Expected: PASS. `pretest` writes the generated file.

- [ ] **Step 5: Commit**

```bash
git add apps/context-mcp/scripts/bundle-plugin.mjs apps/context-mcp/src/bundlePlugin.test.ts apps/context-mcp/package.json apps/capture/package.json package.json package-lock.json .gitignore
git commit -m "$(cat <<'EOF'
Bundle the context server into one file the capture app can ship.

EOF
)"
```

---

### Task 4: Plugin manifests, skill, and install text

**Files:**
- Create: `apps/capture/src/lib/pluginFiles.ts`
- Create: `apps/capture/src/lib/pluginFiles.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `PLUGIN_ZIP_ROOT = "personal-os-plugin"`
  - `PLUGIN_ZIP_NAME = "personal-os-plugin.zip"`
  - `INSTALL_STEPS: { title: string; body: string }[]`
  - `installGuideMarkdown(): string`
  - `pluginFileEntries(): { path: string; text: string }[]` with paths relative to `personal-os-plugin/`

- [ ] **Step 1: Write the failing test**

Create `apps/capture/src/lib/pluginFiles.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  INSTALL_STEPS,
  installGuideMarkdown,
  pluginFileEntries,
} from "./pluginFiles.js";

describe("plugin files", () => {
  it("points each host at its own plugin root variable", () => {
    const files = new Map(pluginFileEntries().map((entry) => [entry.path, entry.text]));
    expect(files.get("plugin/.mcp.json")).toContain("${CLAUDE_PLUGIN_ROOT}/server/server.js");
    expect(files.get("plugin/.mcp.json")).toContain("${CLAUDE_PLUGIN_ROOT}/personal-os");
    expect(files.get("plugin/cursor-mcp.json")).toContain("${CURSOR_PLUGIN_ROOT}/server/server.js");
    expect(files.get("plugin/.cursor-plugin/plugin.json")).toContain("./cursor-mcp.json");
    expect(files.get("plugin/mcp.json")).toContain('"type": "stdio"');
    expect(files.get("plugin/mcp.json")).toContain("${PLUGIN_ROOT}/server/server.js");
    expect(files.get("plugin/plugin.json")).toContain("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(files.get("plugin/skills/use-personal-context/SKILL.md")).toContain("list_shelves");
    expect(files.get("plugin/skills/use-personal-context/SKILL.md")).toContain("search_context");
    expect(files.get("plugin/skills/use-personal-context/SKILL.md")).toContain("get_note");
    expect(files.get("plugin/skills/use-personal-context/SKILL.md")).toContain("capture:");
    expect(files.get(".claude-plugin/marketplace.json")).toContain('"./plugin"');
    expect(files.get(".agents/plugins/marketplace.json")).toContain('"./plugin"');
    expect(files.get("INSTALL.md")).toBe(installGuideMarkdown());
  });

  it("uses the same install commands as the guide", () => {
    const markdown = installGuideMarkdown();
    for (const step of INSTALL_STEPS) {
      expect(markdown).toContain(step.title);
      expect(markdown).toContain(step.body);
    }
    expect(markdown).toContain("claude plugin marketplace add /absolute/path/to/personal-os-plugin");
    expect(markdown).toContain("claude plugin install personal-os@personal-os");
    expect(markdown).toContain("~/.cursor/plugins/local/personal-os");
    expect(markdown).toContain("codex plugin marketplace add /absolute/path/to/personal-os-plugin");
    expect(markdown).toContain("Node.js 20");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @personal-os/capture -- src/lib/pluginFiles.test.ts`

Expected: FAIL because `pluginFiles.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/capture/src/lib/pluginFiles.ts`:

```typescript
export const PLUGIN_ZIP_ROOT = "personal-os-plugin";
export const PLUGIN_ZIP_NAME = "personal-os-plugin.zip";

const serverArgs = (rootVar: string) => [
  `${rootVar}/server/server.js`,
  "--pack",
  `${rootVar}/personal-os`,
];

function mcpConfig(rootVar: string, stdio: boolean): string {
  const server: Record<string, unknown> = {
    command: "node",
    args: serverArgs(rootVar),
  };
  if (stdio) server.type = "stdio";
  const file: Record<string, unknown> = {
    mcpServers: { "personal-os": server },
  };
  if (stdio) {
    file.$schema = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
  }
  return JSON.stringify(file, null, 2);
}

export const INSTALL_STEPS = [
  {
    title: "Unzip the download",
    body: "Unzip personal-os-plugin.zip. The outer folder is personal-os-plugin. The plugin itself is the inner plugin folder.",
  },
  {
    title: "Install Node.js 20 or newer",
    body: "Install Node.js 20 or newer on the computer that runs the assistant.",
  },
  {
    title: "Claude Code",
    body: "From a shell, run claude plugin marketplace add /absolute/path/to/personal-os-plugin, then claude plugin install personal-os@personal-os. Start a new session and ask it to search your notes.",
  },
  {
    title: "Cursor",
    body: "Copy the inner plugin folder to ~/.cursor/plugins/local/personal-os, so .cursor-plugin/plugin.json is directly inside that folder. Reload the window. Local plugin imports must be allowed.",
  },
  {
    title: "Codex and ChatGPT desktop",
    body: "Run codex plugin marketplace add /absolute/path/to/personal-os-plugin, then install Personal OS from that marketplace in the ChatGPT desktop app or Codex CLI. Use a local thread. Cloud chats and the Codex IDE extension do not run this server.",
  },
];

export function installGuideMarkdown(): string {
  return [
    "# Install Personal OS",
    "",
    ...INSTALL_STEPS.flatMap((step) => [`## ${step.title}`, "", step.body, ""]),
  ].join("\n");
}

const skill = `---
name: use-personal-context
description: Search the user's Personal OS notes for preferences, routines, goals, and collaboration rules before answering from personal context.
---

When a task depends on this user's preferences, routines, goals, or collaboration rules, use the personal-os MCP tools in this order:

1. list_shelves
2. search_context with a query and an optional shelf
3. get_note with an id or a pack-relative path

Quote only the note that applies. Treat tags that start with capture: as provenance.
`;

export function pluginFileEntries(): { path: string; text: string }[] {
  return [
    {
      path: "plugin/.claude-plugin/plugin.json",
      text: JSON.stringify(
        {
          name: "personal-os",
          version: "1.0.0",
          description: "Personal context notes for this user, served by a local MCP server.",
        },
        null,
        2
      ),
    },
    { path: "plugin/.mcp.json", text: mcpConfig("${CLAUDE_PLUGIN_ROOT}", false) },
    {
      path: "plugin/.cursor-plugin/plugin.json",
      text: JSON.stringify(
        {
          name: "personal-os",
          version: "1.0.0",
          description: "Personal context notes for this user, served by a local MCP server.",
          mcpServers: "./cursor-mcp.json",
        },
        null,
        2
      ),
    },
    { path: "plugin/cursor-mcp.json", text: mcpConfig("${CURSOR_PLUGIN_ROOT}", false) },
    {
      path: "plugin/plugin.json",
      text: JSON.stringify(
        {
          $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
          name: "personal-os",
          version: "1.0.0",
          description: "Personal context notes for this user, served by a local MCP server.",
        },
        null,
        2
      ),
    },
    { path: "plugin/mcp.json", text: mcpConfig("${PLUGIN_ROOT}", true) },
    { path: "plugin/skills/use-personal-context/SKILL.md", text: skill },
    {
      path: ".claude-plugin/marketplace.json",
      text: JSON.stringify(
        {
          name: "personal-os",
          owner: { name: "Personal OS" },
          plugins: [
            {
              name: "personal-os",
              source: "./plugin",
              description: "Personal context notes with a local MCP server",
            },
          ],
        },
        null,
        2
      ),
    },
    {
      path: ".agents/plugins/marketplace.json",
      text: JSON.stringify(
        {
          name: "personal-os",
          interface: { displayName: "Personal OS" },
          plugins: [
            {
              name: "personal-os",
              source: { source: "local", path: "./plugin" },
              policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
              category: "Productivity",
            },
          ],
        },
        null,
        2
      ),
    },
    { path: "INSTALL.md", text: installGuideMarkdown() },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @personal-os/capture -- src/lib/pluginFiles.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/capture/src/lib/pluginFiles.ts apps/capture/src/lib/pluginFiles.test.ts
git commit -m "$(cat <<'EOF'
Add the plugin manifests and install steps the download will ship.

EOF
)"
```

---

### Task 5: Build the plugin zip

**Files:**
- Modify: `apps/capture/src/lib/exportZip.ts`
- Modify: `apps/capture/src/lib/exportZip.test.ts`

**Interfaces:**
- Consumes: `serializeNote`, `buildManifest`, `serializeShelves`, `PackShelf` from `@personal-os/pack-core`; `PLUGIN_ZIP_ROOT`, `PLUGIN_ZIP_NAME`, `pluginFileEntries` from `./pluginFiles.js`
- Produces: `buildPluginZip(notes: Note[], shelves: PackShelf[], serverSource: string): Promise<Blob>` and `downloadPackZip(blob: Blob, filename = PLUGIN_ZIP_NAME)`. Throws `Error("Bundled server is missing")` when `serverSource` is empty. An empty shelf description is written as the shelf slug so the shelves file stays valid.

- [ ] **Step 1: Replace the zip test**

Replace `apps/capture/src/lib/exportZip.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { Note, PackShelf } from "@personal-os/pack-core";
import { buildPluginZip } from "./exportZip.js";

const notes: Note[] = [
  {
    id: "note_abc123def456",
    title: "Prefer short answers",
    shelf: "preferences",
    tags: [],
    created: "2026-09-04T00:00:00.000Z",
    updated: "2026-09-04T00:00:00.000Z",
    body: "Be concise.",
    path: "preferences/prefer-short-answers.md",
  },
];

const shelves: PackShelf[] = [
  {
    slug: "preferences",
    name: "Preferences",
    description: "How you like things done.",
    color: "#0f6e6e",
    order: 1,
    isDefault: true,
  },
  {
    slug: "goals",
    name: "Goals",
    description: "",
    color: "#8f2d2d",
    order: 2,
    isDefault: true,
  },
];

describe("buildPluginZip", () => {
  it("wraps the pack, server, and plugin files", async () => {
    const zip = await JSZip.loadAsync(await buildPluginZip(notes, shelves, "console.log('server')\n"));
    const root = "personal-os-plugin";
    const markdown = await zip.file(`${root}/plugin/personal-os/preferences/prefer-short-answers.md`)!.async("string");
    expect(markdown).toContain("Be concise.");
    const manifest = JSON.parse(await zip.file(`${root}/plugin/personal-os/_meta/manifest.json`)!.async("string"));
    expect(manifest.version).toBe(1);
    const shelfFile = JSON.parse(await zip.file(`${root}/plugin/personal-os/_meta/shelves.json`)!.async("string"));
    expect(shelfFile.shelves.find((shelf: PackShelf) => shelf.slug === "goals").description).toBe("goals");
    expect(await zip.file(`${root}/plugin/personal-os/goals/.keep`)!.async("string")).toBe("");
    expect(await zip.file(`${root}/plugin/server/server.js`)!.async("string")).toContain("server");
    expect(zip.file(`${root}/INSTALL.md`)).not.toBeNull();
    expect(zip.file(`${root}/plugin/mcp.json`)).not.toBeNull();
    expect(zip.file(`${root}/.claude-plugin/marketplace.json`)).not.toBeNull();
    expect(zip.file(`${root}/.agents/plugins/marketplace.json`)).not.toBeNull();
  });

  it("rejects a missing server", async () => {
    await expect(buildPluginZip(notes, shelves, "  ")).rejects.toThrow("Bundled server is missing");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @personal-os/capture -- src/lib/exportZip.test.ts`

Expected: FAIL because `buildPluginZip` is not exported.

- [ ] **Step 3: Write the implementation**

Replace `apps/capture/src/lib/exportZip.ts` with:

```typescript
import {
  buildManifest,
  serializeNote,
  serializeShelves,
  META_DIR,
  type Note,
  type PackShelf,
} from "@personal-os/pack-core";
import JSZip from "jszip";
import { PLUGIN_ZIP_NAME, PLUGIN_ZIP_ROOT, pluginFileEntries } from "./pluginFiles.js";

export async function buildPluginZip(
  notes: Note[],
  shelves: PackShelf[],
  serverSource: string
): Promise<Blob> {
  if (!serverSource.trim()) throw new Error("Bundled server is missing");
  const zip = new JSZip();
  const pack = `${PLUGIN_ZIP_ROOT}/plugin/personal-os`;
  for (const note of notes) zip.file(`${pack}/${note.path}`, serializeNote(note));
  for (const shelf of shelves) {
    const hasNote = notes.some((note) => note.shelf === shelf.slug);
    if (!hasNote) zip.file(`${pack}/${shelf.slug}/.keep`, "");
  }
  const shelfFile = shelves.map((shelf) => ({
    ...shelf,
    description: shelf.description.trim() || shelf.slug,
  }));
  zip.file(`${pack}/${META_DIR}/manifest.json`, JSON.stringify(buildManifest(notes), null, 2));
  zip.file(`${pack}/${META_DIR}/shelves.json`, serializeShelves(shelfFile));
  for (const entry of pluginFileEntries()) {
    zip.file(`${PLUGIN_ZIP_ROOT}/${entry.path}`, entry.text);
  }
  zip.file(`${PLUGIN_ZIP_ROOT}/plugin/server/server.js`, serverSource);
  return zip.generateAsync({ type: "blob" });
}

export function downloadPackZip(blob: Blob, filename = PLUGIN_ZIP_NAME) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @personal-os/capture -- src/lib/exportZip.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/capture/src/lib/exportZip.ts apps/capture/src/lib/exportZip.test.ts
git commit -m "$(cat <<'EOF'
Download a plugin zip that contains the notes, server, and host manifests.

EOF
)"
```

---

### Task 6: Import preview

**Files:**
- Create: `apps/capture/src/lib/importPlugin.ts`
- Create: `apps/capture/src/lib/importPlugin.test.ts`

**Interfaces:**
- Consumes: `parseNoteMarkdown` from `@personal-os/pack-core/parse`, `parseShelves`, `PackShelf`, `Note`, `DEFAULT_SHELVES` from `@personal-os/pack-core`
- Produces:
  - `NOT_A_PACK = "This file is not a Personal OS plugin or pack."`
  - `previewPluginImport(zipBytes: ArrayBuffer, currentNotes: Note[], currentShelves: PackShelf[]): Promise<ImportPreview>`
  - `ImportPreview` fields: `notesToAdd`, `notesToUpdate`, `unchangedCount`, `browserOnlyCount`, `shelvesToAdd`, `shelvesToUpdate`, `skippedCount`, `shelvesFromFolders`, `canConfirm`
  - `mergeImportedNotes(current: Note[], preview: ImportPreview): Note[]`
  - `mergeImportedShelves(current: PackShelf[], preview: ImportPreview): PackShelf[]`

`canConfirm` is true only when a note or shelf would change, and it is false when the pack contains note files and every one was skipped. Duplicate ids keep the first file in JSZip enumeration order. Tag sets ignore order. Shelf colors compare case-insensitively. Built-in slugs from `DEFAULT_SHELVES` stay `isDefault: true` in the merged shelves.

- [ ] **Step 1: Write the failing test**

Create `apps/capture/src/lib/importPlugin.test.ts`:

```typescript
import { serializeNote, type Note, type PackShelf } from "@personal-os/pack-core";
import { parseNoteMarkdown } from "@personal-os/pack-core/parse";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  mergeImportedNotes,
  mergeImportedShelves,
  NOT_A_PACK,
  previewPluginImport,
} from "./importPlugin.js";

function roundTrip(value: Note): Note {
  return parseNoteMarkdown(serializeNote(value), value.path);
}

function note(overrides: Partial<Note>): Note {
  return {
    id: "note_one",
    title: "Prefer short answers",
    shelf: "preferences",
    tags: ["tone"],
    created: "2026-09-04T00:00:00.000Z",
    updated: "2026-09-04T00:00:00.000Z",
    body: "Be concise.",
    path: "preferences/prefer-short-answers.md",
    ...overrides,
  };
}

const preferences: PackShelf = {
  slug: "preferences",
  name: "Preferences",
  description: "How you like things done.",
  color: "#0f6e6e",
  order: 1,
  isDefault: true,
};

async function zipWith(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [path, text] of Object.entries(files)) zip.file(path, text);
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("previewPluginImport", () => {
  it("counts adds, updates, unchanged notes, and browser-only notes", async () => {
    const incoming = note({ body: "Be very concise.", tags: ["tone", "style"] });
    const localOnly = note({ id: "note_local", path: "goals/local.md", shelf: "goals", title: "Local" });
    const same = note({ id: "note_same", path: "preferences/same.md", title: "Same", tags: ["b", "a"] });
    const bytes = await zipWith({
      "personal-os-plugin/plugin/personal-os/preferences/prefer-short-answers.md": serializeNote(incoming),
      "personal-os-plugin/plugin/personal-os/preferences/same.md": serializeNote(note({ ...same, tags: ["a", "b"] })),
      "personal-os-plugin/plugin/personal-os/preferences/fresh.md": serializeNote(
        note({ id: "note_fresh", path: "preferences/fresh.md", title: "Fresh" })
      ),
      "personal-os-plugin/plugin/personal-os/_meta/shelves.json": JSON.stringify({
        version: 1,
        shelves: [{ ...preferences, description: "Shorter answers." }],
      }),
    });
    const preview = await previewPluginImport(
      bytes,
      [roundTrip(note({ tags: ["style", "tone"] })), roundTrip(localOnly), roundTrip(same)],
      [preferences]
    );
    expect(preview.notesToAdd.map((item) => item.id)).toEqual(["note_fresh"]);
    expect(preview.notesToUpdate.map((item) => item.id)).toEqual(["note_one"]);
    expect(preview.unchangedCount).toBe(1);
    expect(preview.browserOnlyCount).toBe(1);
    expect(preview.shelvesToUpdate.map((item) => item.slug)).toEqual(["preferences"]);
    expect(preview.canConfirm).toBe(true);
    expect(preview.shelvesFromFolders).toBe(false);
  });

  it("skips a bad note and a duplicate id, and keeps the first", async () => {
    const first = serializeNote(note({ title: "First" }));
    const second = serializeNote(note({ title: "Second" }));
    const bytes = await zipWith({
      "plugin/personal-os/preferences/a.md": first,
      "plugin/personal-os/preferences/b.md": second,
      "plugin/personal-os/preferences/bad.md": "not a note",
    });
    const preview = await previewPluginImport(bytes, [], []);
    expect(preview.notesToAdd.map((item) => item.title)).toEqual(["First"]);
    expect(preview.skippedCount).toBe(2);
    expect(preview.shelvesFromFolders).toBe(true);
    expect(preview.shelvesToAdd[0]).toMatchObject({
      slug: "preferences",
      name: "preferences",
      description: "preferences",
      color: "#0f6e6e",
      isDefault: true,
    });
  });

  it("opens a pack-only zip and rejects a zip with no pack", async () => {
    const bytes = await zipWith({
      "personal-os/goals/ship.md": serializeNote(
        note({ id: "note_goal", shelf: "goals", path: "goals/ship.md", title: "Ship" })
      ),
    });
    const preview = await previewPluginImport(bytes, [], [preferences]);
    expect(preview.notesToAdd).toHaveLength(1);
    expect(preview.shelvesToAdd.map((item) => item.slug)).toEqual(["goals"]);

    await expect(previewPluginImport(await zipWith({ "readme.txt": "hi" }), [], [])).rejects.toThrow(NOT_A_PACK);
    await expect(previewPluginImport(new TextEncoder().encode("nope").buffer, [], [])).rejects.toThrow(NOT_A_PACK);
  });

  it("refuses confirm when every note failed or nothing changed", async () => {
    const failed = await previewPluginImport(
      await zipWith({ "personal-os/preferences/bad.md": "nope" }),
      [],
      []
    );
    expect(failed.canConfirm).toBe(false);

    const current = roundTrip(note({}));
    const same = await previewPluginImport(
      await zipWith({
        "personal-os/preferences/prefer-short-answers.md": serializeNote(note({})),
        "personal-os/_meta/shelves.json": JSON.stringify({ version: 1, shelves: [preferences] }),
      }),
      [current],
      [preferences]
    );
    expect(same.canConfirm).toBe(false);
    expect(same.unchangedCount).toBe(1);
  });

  it("merges notes and shelves without dropping browser-only records", () => {
    const preview = {
      notesToAdd: [note({ id: "note_new", title: "New" })],
      notesToUpdate: [note({ body: "Updated" })],
      unchangedCount: 0,
      browserOnlyCount: 1,
      shelvesToAdd: [
        {
          slug: "reading",
          name: "Reading",
          description: "reading",
          color: "#246868",
          order: 3,
          isDefault: false,
        },
      ],
      shelvesToUpdate: [{ ...preferences, description: "Shorter." }],
      skippedCount: 0,
      shelvesFromFolders: false,
      canConfirm: true,
    };
    const local = note({ id: "note_local", title: "Stay" });
    expect(mergeImportedNotes([note({}), local], preview).map((item) => item.id)).toEqual([
      "note_one",
      "note_local",
      "note_new",
    ]);
    expect(mergeImportedNotes([note({}), local], preview)[0].body).toBe("Updated");
    expect(mergeImportedShelves([preferences], preview).map((item) => item.slug)).toEqual([
      "preferences",
      "reading",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @personal-os/capture -- src/lib/importPlugin.test.ts`

Expected: FAIL because `importPlugin.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/capture/src/lib/importPlugin.ts`:

```typescript
import {
  DEFAULT_SHELVES,
  parseShelves,
  type Note,
  type PackShelf,
} from "@personal-os/pack-core";
import { parseNoteMarkdown } from "@personal-os/pack-core/parse";
import JSZip from "jszip";

export const NOT_A_PACK = "This file is not a Personal OS plugin or pack.";
const BUILTIN = new Set<string>(DEFAULT_SHELVES);

export type ImportPreview = {
  notesToAdd: Note[];
  notesToUpdate: Note[];
  unchangedCount: number;
  browserOnlyCount: number;
  shelvesToAdd: PackShelf[];
  shelvesToUpdate: PackShelf[];
  skippedCount: number;
  shelvesFromFolders: boolean;
  canConfirm: boolean;
};

function sameTags(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((tag, index) => tag === sortedRight[index]);
}

function sameNote(left: Note, right: Note): boolean {
  return (
    left.title === right.title &&
    left.body === right.body &&
    left.shelf === right.shelf &&
    left.path === right.path &&
    sameTags(left.tags, right.tags)
  );
}

function sameShelf(left: PackShelf, right: PackShelf): boolean {
  return (
    left.name === right.name &&
    left.description === right.description &&
    left.color.toLowerCase() === right.color.toLowerCase() &&
    left.order === right.order
  );
}

function fallbackShelf(slug: string, order: number): PackShelf {
  return {
    slug,
    name: slug,
    description: slug,
    color: "#0f6e6e",
    order,
    isDefault: BUILTIN.has(slug),
  };
}

export function findPackPrefix(paths: string[]): string | null {
  const normalized = paths.map((item) => item.replaceAll("\\", "/"));
  for (const marker of ["plugin/personal-os/", "personal-os/"]) {
    const hit = normalized.find((item) => item.includes(marker));
    if (hit) return hit.slice(0, hit.indexOf(marker) + marker.length);
  }
  return null;
}

export async function previewPluginImport(
  zipBytes: ArrayBuffer,
  currentNotes: Note[],
  currentShelves: PackShelf[]
): Promise<ImportPreview> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch {
    throw new Error(NOT_A_PACK);
  }
  const paths = Object.keys(zip.files);
  const prefix = findPackPrefix(paths);
  if (!prefix) throw new Error(NOT_A_PACK);

  const relative = paths
    .filter((item) => item.startsWith(prefix) && !zip.files[item].dir)
    .map((item) => item.slice(prefix.length));

  let shelvesFromFolders = false;
  let parsedShelves: PackShelf[] = [];
  const shelfJson = relative.find((item) => item === "_meta/shelves.json");
  if (shelfJson) {
    try {
      parsedShelves = parseShelves(await zip.file(prefix + shelfJson)!.async("string"));
    } catch {
      shelvesFromFolders = true;
    }
  } else {
    shelvesFromFolders = true;
  }

  const folderSlugs = [
    ...new Set(
      relative
        .filter((item) => item.split("/").length >= 2 && !item.startsWith("_meta/"))
        .map((item) => item.split("/")[0])
    ),
  ].sort();
  const known = new Set(parsedShelves.map((shelf) => shelf.slug));
  folderSlugs.forEach((slug, index) => {
    if (!known.has(slug)) parsedShelves.push(fallbackShelf(slug, parsedShelves.length + index + 1));
  });

  const seen = new Set<string>();
  const incoming: Note[] = [];
  let skippedCount = 0;
  let noteFileCount = 0;
  for (const relativePath of relative) {
    if (!relativePath.endsWith(".md") || relativePath.startsWith("_meta/")) continue;
    if (relativePath.split("/").length !== 2) continue;
    noteFileCount += 1;
    try {
      const markdown = await zip.file(prefix + relativePath)!.async("string");
      const parsed = parseNoteMarkdown(markdown, relativePath);
      if (seen.has(parsed.id)) {
        skippedCount += 1;
        continue;
      }
      seen.add(parsed.id);
      incoming.push(parsed);
    } catch {
      skippedCount += 1;
    }
  }

  const currentById = new Map(currentNotes.map((item) => [item.id, item]));
  const notesToAdd = incoming.filter((item) => !currentById.has(item.id));
  const notesToUpdate = incoming.filter((item) => {
    const current = currentById.get(item.id);
    return current !== undefined && !sameNote(current, item);
  });
  const unchangedCount = incoming.length - notesToAdd.length - notesToUpdate.length;
  const browserOnlyCount = currentNotes.filter((item) => !seen.has(item.id)).length;

  const currentShelfBySlug = new Map(currentShelves.map((item) => [item.slug, item]));
  const shelvesToAdd = parsedShelves.filter((item) => !currentShelfBySlug.has(item.slug));
  const shelvesToUpdate = parsedShelves.filter((item) => {
    const current = currentShelfBySlug.get(item.slug);
    return current !== undefined && !sameShelf(current, item);
  });
  const allNotesFailed = noteFileCount > 0 && incoming.length === 0;
  const changes =
    notesToAdd.length + notesToUpdate.length + shelvesToAdd.length + shelvesToUpdate.length;

  return {
    notesToAdd,
    notesToUpdate,
    unchangedCount,
    browserOnlyCount,
    shelvesToAdd,
    shelvesToUpdate,
    skippedCount,
    shelvesFromFolders,
    canConfirm: changes > 0 && !allNotesFailed,
  };
}

export function mergeImportedNotes(current: Note[], preview: ImportPreview): Note[] {
  const updates = new Map(preview.notesToUpdate.map((item) => [item.id, item]));
  return [...current.map((item) => updates.get(item.id) ?? item), ...preview.notesToAdd];
}

export function mergeImportedShelves(current: PackShelf[], preview: ImportPreview): PackShelf[] {
  const map = new Map(current.map((item) => [item.slug, item]));
  for (const shelf of [...preview.shelvesToAdd, ...preview.shelvesToUpdate]) {
    map.set(shelf.slug, { ...shelf, isDefault: BUILTIN.has(shelf.slug) });
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @personal-os/capture -- src/lib/importPlugin.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/capture/src/lib/importPlugin.ts apps/capture/src/lib/importPlugin.test.ts
git commit -m "$(cat <<'EOF'
Preview a plugin import as added, updated, and browser-only notes.

EOF
)"
```

---

### Task 7: Apply a confirmed merge

**Files:**
- Modify: `apps/capture/src/store/notesStore.ts`
- Modify: `apps/capture/src/store/shelvesStore.ts`
- Modify: `apps/capture/src/store/shelvesStore.test.ts`
- Create: `apps/capture/src/lib/applyImport.ts`
- Create: `apps/capture/src/lib/applyImport.test.ts`

**Interfaces:**
- Consumes: `mergeImportedNotes`, `mergeImportedShelves`, `ImportPreview` from `./importPlugin.js`; `Note`; `ShelfRecord`
- Produces:
  - `replaceNotes(notes: Note[]): void` in `notesStore.ts`
  - `saveShelves(shelves: ShelfRecord[]): void` in `shelvesStore.ts`
  - `applyConfirmedImport(currentNotes, currentShelves, preview, writers?): { notes: Note[]; shelves: ShelfRecord[] }`
  - `loadShelves` keeps a stored default shelf's `name`, `description`, `color`, and `order`, and still forces `isDefault: true`

- [ ] **Step 1: Write the failing tests**

Add this test to `apps/capture/src/store/shelvesStore.test.ts`:

```typescript
  it("keeps a stored default shelf name and order", () => {
    localStorage.setItem(
      SHELVES_KEY,
      JSON.stringify([
        {
          slug: "preferences",
          name: "How I like things",
          description: "Short",
          color: "#0f6e6e",
          order: 9,
          isDefault: true,
        },
      ])
    );
    const preferences = loadShelves().find((shelf) => shelf.slug === "preferences");
    expect(preferences).toMatchObject({
      name: "How I like things",
      description: "Short",
      order: 9,
      isDefault: true,
    });
  });
```

Create `apps/capture/src/lib/applyImport.test.ts`:

```typescript
import type { Note, PackShelf } from "@personal-os/pack-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyConfirmedImport } from "./applyImport.js";
import type { ImportPreview } from "./importPlugin.js";
import { loadNotes, STORAGE_KEY } from "../store/notesStore.js";
import { loadShelves, SHELVES_KEY } from "../store/shelvesStore.js";

const note: Note = {
  id: "note_one",
  title: "Fresh",
  shelf: "preferences",
  tags: [],
  created: "2026-09-04T00:00:00.000Z",
  updated: "2026-09-04T00:00:00.000Z",
  body: "Hello",
  path: "preferences/fresh.md",
};

const shelf: PackShelf = {
  slug: "reading",
  name: "Reading",
  description: "reading",
  color: "#246868",
  order: 8,
  isDefault: false,
};

beforeEach(() => localStorage.clear());

describe("applyConfirmedImport", () => {
  it("writes notes once, then shelves once", () => {
    const preview: ImportPreview = {
      notesToAdd: [note],
      notesToUpdate: [],
      unchangedCount: 0,
      browserOnlyCount: 0,
      shelvesToAdd: [shelf],
      shelvesToUpdate: [],
      skippedCount: 0,
      shelvesFromFolders: false,
      canConfirm: true,
    };
    applyConfirmedImport([], [], preview);
    expect(loadNotes().map((item) => item.id)).toEqual(["note_one"]);
    expect(loadShelves().some((item) => item.slug === "reading")).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toContain("note_one");
    expect(localStorage.getItem(SHELVES_KEY)).toContain("reading");
  });

  it("does not write shelves when the note write throws", () => {
    const writeShelves = vi.fn();
    const preview: ImportPreview = {
      notesToAdd: [note],
      notesToUpdate: [],
      unchangedCount: 0,
      browserOnlyCount: 0,
      shelvesToAdd: [shelf],
      shelvesToUpdate: [],
      skippedCount: 0,
      shelvesFromFolders: false,
      canConfirm: true,
    };
    expect(() =>
      applyConfirmedImport([], [], preview, {
        writeNotes: () => {
          throw new Error("Storage full. Download your pack, then delete old notes.");
        },
        writeShelves,
      })
    ).toThrow(/Storage full/);
    expect(writeShelves).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @personal-os/capture -- src/store/shelvesStore.test.ts src/lib/applyImport.test.ts`

Expected: FAIL because `saveShelves` behavior for default names is missing and `applyImport.js` does not exist.

- [ ] **Step 3: Write the implementation**

In `apps/capture/src/store/notesStore.ts`, add:

```typescript
export function replaceNotes(notes: Note[]): void {
  writeRaw(notes);
}
```

In `apps/capture/src/store/shelvesStore.ts`, change the stored-default branch inside `loadShelves` from description-and-color only to:

```typescript
      return {
        ...fallback,
        name: saved.name.trim() || fallback.name,
        description: saved.description,
        color: saved.color,
        order: saved.order,
        isDefault: true,
      };
```

Add:

```typescript
export function saveShelves(shelves: ShelfRecord[]): void {
  writeShelves(shelves);
}
```

Create `apps/capture/src/lib/applyImport.ts`:

```typescript
import type { Note } from "@personal-os/pack-core";
import { replaceNotes } from "../store/notesStore.js";
import { saveShelves, type ShelfRecord } from "../store/shelvesStore.js";
import { mergeImportedNotes, mergeImportedShelves, type ImportPreview } from "./importPlugin.js";

type ImportWriters = {
  writeNotes: (notes: Note[]) => void;
  writeShelves: (shelves: ShelfRecord[]) => void;
};

export function applyConfirmedImport(
  currentNotes: Note[],
  currentShelves: ShelfRecord[],
  preview: ImportPreview,
  writers: ImportWriters = { writeNotes: replaceNotes, writeShelves: saveShelves }
): { notes: Note[]; shelves: ShelfRecord[] } {
  const notes = mergeImportedNotes(currentNotes, preview);
  const shelves = mergeImportedShelves(currentShelves, preview);
  writers.writeNotes(notes);
  writers.writeShelves(shelves);
  return { notes, shelves };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @personal-os/capture -- src/store/shelvesStore.test.ts src/lib/applyImport.test.ts`

Expected: PASS. The existing default-shelf order test still passes when storage is empty.

- [ ] **Step 5: Commit**

```bash
git add apps/capture/src/store/notesStore.ts apps/capture/src/store/shelvesStore.ts apps/capture/src/store/shelvesStore.test.ts apps/capture/src/lib/applyImport.ts apps/capture/src/lib/applyImport.test.ts
git commit -m "$(cat <<'EOF'
Save a confirmed import without removing notes that exist only in this browser.

EOF
)"
```

---

### Task 8: Desk menu, install guide, and import summary

**Files:**
- Modify: `apps/capture/src/route.ts`
- Modify: `apps/capture/src/route.test.ts`
- Create: `apps/capture/src/components/InstallGuide.tsx`
- Modify: `apps/capture/src/App.tsx`
- Modify: `apps/capture/src/App.test.tsx`

**Interfaces:**
- Consumes: `buildPluginZip`, `downloadPackZip`, `previewPluginImport`, `applyConfirmedImport`, `NOT_A_PACK`, `INSTALL_STEPS`, `PLUGIN_ZIP_NAME`
- Produces: hash route `{ view: "install" }` for `#/install`. The desk menu shows **Download pack** / **Downloads personal-os-plugin.zip**, **Import plugin**, and **Install guide**.

- [ ] **Step 1: Write the failing tests**

In `apps/capture/src/route.test.ts`, add:

```typescript
  it("reads the install guide route", () => {
    expect(parseRoute("#/install")).toEqual({ view: "install" });
  });
```

In `apps/capture/src/App.test.tsx`, change the download assertion to:

```typescript
    expect(container.textContent).toContain("Downloads personal-os-plugin.zip");
```

Add this test in the same `describe("App")` block. Import `serializeNote` from `@personal-os/pack-core` and `JSZip` from `jszip` at the top of the test file.

```typescript
  it("opens the install guide and previews an import", async () => {
    act(() => root.render(<App />));
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Desk menu"]')!.click();
    });
    act(() => {
      [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Install guide")
      )!.click();
    });
    expect(container.textContent).toContain("Claude Code");
    expect(container.textContent).toContain("Cursor");
    expect(container.textContent).toContain("Codex and ChatGPT desktop");

    const zip = new JSZip();
    zip.file(
      "personal-os/preferences/fresh.md",
      serializeNote({
        id: "note_imported",
        title: "Imported note",
        shelf: "preferences",
        tags: [],
        created: "2026-09-04T00:00:00.000Z",
        updated: "2026-09-04T00:00:00.000Z",
        body: "From the plugin.",
        path: "preferences/fresh.md",
      })
    );
    const file = new File([await zip.generateAsync({ type: "arraybuffer" })], "personal-os.zip", {
      type: "application/zip",
    });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Added");
    expect(container.textContent).toContain("1");

    act(() => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel")!.click();
    });
    expect(loadNotes()).toHaveLength(0);

    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Confirm merge")!.click();
    });
    expect(loadNotes().map((item) => item.id)).toEqual(["note_imported"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @personal-os/capture -- src/route.test.ts src/App.test.tsx`

Expected: FAIL. The menu still says `Downloads personal-os.zip`, and `#/install` is not a route.

- [ ] **Step 3: Write the implementation**

In `apps/capture/src/route.ts`, add `{ view: "install" }` to `DeskRoute` and this line before the shelf match in `parseRoute`:

```typescript
  if (hash === "#/install") return { view: "install" };
```

Create `apps/capture/src/components/InstallGuide.tsx`:

```tsx
import { INSTALL_STEPS } from "../lib/pluginFiles.js";

export function InstallGuide() {
  return (
    <section className="installGuide">
      <h2>Install your plugin</h2>
      <p>Unzip the download, then use the folder in the assistant you want. This page does not install it for you.</p>
      {INSTALL_STEPS.map((step) => (
        <article key={step.title}>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </article>
      ))}
    </section>
  );
}
```

In `apps/capture/src/App.tsx`:

- Import `buildPluginZip` instead of `buildPackZip`, plus `InstallGuide`, `applyConfirmedImport`, `previewPluginImport`, `NOT_A_PACK`, and `PLUGIN_ZIP_NAME`.
- Import the generated server with `import bundledServer from "./generated/plugin-server.js?raw";`
- Add state `importPreview` for `ImportPreview | null`, `importError` for `string | null`, and a ref for the file input.
- Change `handleDownload` to:

```typescript
      const blob = await buildPluginZip(loadNotes(), loadShelves(), bundledServer);
      downloadPackZip(blob, PLUGIN_ZIP_NAME);
```

- Add `handleImportFile` that reads `file.arrayBuffer()`, calls `previewPluginImport(bytes, loadNotes(), loadShelves())`, stores the preview, and on throw sets the banner to `error instanceof Error ? error.message : NOT_A_PACK`.
- Add `confirmImport` that calls `applyConfirmedImport(loadNotes(), loadShelves(), importPreview)`, then `reload()`, clears the preview, and on throw sets the banner to the error message and clears the preview.
- In the menu, change the subtitle to `Downloads personal-os-plugin.zip`. Add **Import plugin** (subtitle `Merge a downloaded plugin`) which clicks the hidden file input, and **Install guide** which calls `go("#/install")`.
- Add `<input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={...} />`.
- Render `<InstallGuide />` when `route.view === "install"`, before the shelf branch.
- When `importPreview` is set, render this modal:

```tsx
<Modal title="Import plugin" onClose={() => setImportPreview(null)}>
  <p>Added {importPreview.notesToAdd.length}</p>
  <p>Updated {importPreview.notesToUpdate.length}</p>
  <p>Unchanged {importPreview.unchangedCount}</p>
  <p>Left as they are {importPreview.browserOnlyCount}</p>
  <p>Shelves added {importPreview.shelvesToAdd.length}</p>
  <p>Shelves updated {importPreview.shelvesToUpdate.length}</p>
  {importPreview.skippedCount > 0 ? <p>Could not read {importPreview.skippedCount} files.</p> : null}
  {importPreview.shelvesFromFolders ? <p>Shelf details were filled in from the folders.</p> : null}
  {importPreview.canConfirm ? null : <p>This browser already has these notes.</p>}
  <button type="button" onClick={() => setImportPreview(null)}>Cancel</button>
  <button type="button" disabled={!importPreview.canConfirm} onClick={() => confirmImport()}>
    Confirm merge
  </button>
</Modal>
```

`handleImportFile` and `confirmImport`:

```typescript
async function handleImportFile(file: File) {
  setImportError(null);
  try {
    const preview = await previewPluginImport(await file.arrayBuffer(), loadNotes(), loadShelves());
    setImportPreview(preview);
  } catch (error) {
    setBanner(error instanceof Error ? error.message : NOT_A_PACK);
  }
}

function confirmImport() {
  if (!importPreview) return;
  try {
    applyConfirmedImport(loadNotes(), loadShelves(), importPreview);
    reload();
    setImportPreview(null);
  } catch (error) {
    setBanner(error instanceof Error ? error.message : "Download failed. Try again.");
    setImportPreview(null);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @personal-os/capture -- src/route.test.ts src/App.test.tsx src/lib/exportZip.test.ts`

Expected: PASS

- [ ] **Step 5: Check the desk in the browser**

With `npm run dev -w @personal-os/capture` already running, open the printed URL.

- Open the desk menu and confirm the subtitle is `Downloads personal-os-plugin.zip`.
- Download a pack and confirm the file name is `personal-os-plugin.zip`.
- Open **Install guide** and confirm the Claude Code, Cursor, and Codex sections are visible.
- Import that zip, choose **Cancel**, and confirm the note count is unchanged.
- Import it again, choose **Confirm merge** when the summary shows changes, or confirm the button is unavailable when the summary says this browser already has these notes.
- Import a non-zip and confirm the banner says `This file is not a Personal OS plugin or pack.`

- [ ] **Step 6: Commit**

```bash
git add apps/capture/src/route.ts apps/capture/src/route.test.ts apps/capture/src/components/InstallGuide.tsx apps/capture/src/App.tsx apps/capture/src/App.test.tsx
git commit -m "$(cat <<'EOF'
Let the desk download a plugin, explain how to install it, and import it back.

EOF
)"
```

---

### Task 9: Document the bundle

**Files:**
- Modify: `docs/pack-format.md`
- Modify: `apps/capture/README.md`
- Modify: `apps/context-mcp/README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/development.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md` quickstart download paragraph

**Interfaces:**
- Consumes: the zip layout and install commands from Task 4 and Task 5
- Produces: docs that describe `personal-os-plugin.zip`, optional `_meta/shelves.json`, and the sibling pack path

- [ ] **Step 1: Update the docs**

In `docs/pack-format.md`, after the manifest section, add an optional shelves section. State that `_meta/shelves.json` has `version: 1` and a `shelves` array of slug, name, description, `#` plus six hex digits, order, and `isDefault`. The loader does not read it. Missing or invalid files are ignored by the server. Pack `version` stays 1.

In `README.md`, `apps/capture/README.md`, and `docs/architecture.md`, replace the `personal-os.zip` download instructions with: Download pack saves `personal-os-plugin.zip`; unzip it; the inner `plugin/personal-os` directory is the pack; the install guide and `INSTALL.md` explain Claude Code, Cursor, and Codex / ChatGPT desktop. Import plugin merges that zip, or an older `personal-os.zip`, after a summary.

In `apps/context-mcp/README.md`, add that a bundled `server.js` reads `../personal-os` when `--pack` and `PERSONAL_OS_PACK_PATH` are unset, and that an explicit `--pack` still wins.

In `docs/development.md`, note that capture build and test run `bundle-plugin` first, and the generated file is gitignored.

In `CHANGELOG.md` under `## [Unreleased]` / `### Added`, add bullets for the plugin zip, the install guide, plugin import, and optional `shelves.json`.

- [ ] **Step 2: Check the docs mention the new download**

Run: `rg -n "personal-os-plugin.zip|shelves.json" README.md apps/capture/README.md apps/context-mcp/README.md docs/pack-format.md docs/architecture.md CHANGELOG.md`

Expected: each of those files has at least one match.

- [ ] **Step 3: Run the workspace tests and build**

Run: `npm test && npm run build`

Expected: PASS. Then ask whether to update `AGENTS.md` and `docs/agent-kb/` with one line that Download pack now produces a plugin zip. Do not edit those files in this task.

- [ ] **Step 4: Commit**

```bash
git add docs/pack-format.md docs/architecture.md docs/development.md apps/capture/README.md apps/context-mcp/README.md README.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
Document the plugin download, shelf file, and import path.

EOF
)"
```

---

## Self-review

Spec coverage:

- Dual-host plus Codex manifests, skill, bundled server, and marketplace files are Tasks 3–5.
- Install page and `INSTALL.md` share `INSTALL_STEPS` in Tasks 4 and 8.
- Import summary, confirm, cancel, pack-only zip, skipped files, and shelf fallback are Tasks 6–8.
- Sibling pack path and explicit `--pack` precedence are Task 2.
- Version 1 pack and optional shelves file are Tasks 1, 5, and 9.
- Browser check is Task 8 Step 5. Host install stays manual and is not a test task.
- `AGENTS.md` and `docs/agent-kb/` stay untouched until the user says yes.

Placeholder scan: no TBD, TODO, or “similar to task N” steps. Task 8 Step 3 names the App state and handlers; the implementer edits `App.tsx` in place rather than replacing the whole desk.

Type consistency: `PackShelf`, `buildPluginZip`, `previewPluginImport`, `ImportPreview`, `mergeImportedNotes`, `mergeImportedShelves`, `applyConfirmedImport`, `replaceNotes`, and `saveShelves` use the same names in the tasks that produce them and the tasks that consume them.
