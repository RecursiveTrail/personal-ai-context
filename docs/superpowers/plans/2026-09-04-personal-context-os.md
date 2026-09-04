# Personal Context OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a PWA that captures spoken/typed Personal OS notes into browser storage and exports a portable markdown pack, plus a local MCP/HTTP server that agents query for relevant snippets.

**Architecture:** Shared `pack-core` library owns note/manifest types, parse/serialize, and keyword search. Capture app (Vite + React) persists notes in `localStorage` and downloads a zip of `personal-os/`. Context MCP (Node) reads a filesystem pack path and exposes `list_shelves`, `search_context`, `get_note` over MCP and HTTP.

**Tech Stack:** TypeScript, npm workspaces, Vite + React (capture PWA), Vitest, JSZip, gray-matter, `@modelcontextprotocol/sdk`, Node `http` (no Express), Web Speech API in the browser.

## Global Constraints

- No accounts, no cloud store, no server-side persistence of notes (spec).
- Capture persistence: browser `localStorage` only for v1 (spec).
- Default shelves: `preferences`, `routines`, `ai-collaboration`, `goals` (spec).
- Retrieval: shelf filter + keyword match only — no embeddings (spec).
- Export: zip of `personal-os/` including `_meta/manifest.json` (spec).
- MCP tools: `list_shelves`, `search_context`, `get_note` (spec).
- STT: browser SpeechRecognition preferred; type/paste fallback required (spec).
- Pack contract is the coupling — capture and MCP must agree on frontmatter fields and folder layout.

---

## File Structure

```
package.json                          # workspaces root
tsconfig.base.json
packages/pack-core/
  package.json
  tsconfig.json
  src/
    types.ts                          # Note, Manifest, SearchHit, DEFAULT_SHELVES
    note.ts                           # parseNoteMarkdown, serializeNote
    manifest.ts                       # buildManifest
    search.ts                         # searchNotes
    loadPack.ts                       # loadPackFromDir (Node fs) — used by MCP only
    index.ts                          # browser-safe exports ONLY (no loadPack)
    node.ts                           # re-exports index + loadPack for Node/MCP
  src/*.test.ts
apps/context-mcp/
  package.json
  tsconfig.json
  src/
    config.ts                         # PACK_PATH from env/argv
    server.ts                         # MCP + HTTP bootstrap
    httpApi.ts                        # GET endpoints
    mcpTools.ts                       # tool handlers
  src/*.test.ts
  README.md                           # Cursor MCP config snippet
apps/capture/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  public/manifest.webmanifest
  src/
    main.tsx
    App.tsx
    types.ts                          # re-export pack-core types if needed
    store/notesStore.ts               # localStorage CRUD
    store/notesStore.test.ts
    lib/exportZip.ts
    lib/exportZip.test.ts
    lib/speech.ts                     # SpeechRecognition wrapper
    components/CaptureForm.tsx
    components/NoteLibrary.tsx
    styles.css
fixtures/personal-os/                 # fixture pack for MCP tests
  preferences/prefer-short-answers.md
  routines/...
  ai-collaboration/...
  goals/...
  _meta/manifest.json
```

---

### Task 1: Monorepo scaffold + pack-core types

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/pack-core/package.json`
- Create: `packages/pack-core/tsconfig.json`
- Create: `packages/pack-core/src/types.ts`
- Create: `packages/pack-core/src/index.ts`
- Create: `packages/pack-core/src/types.test.ts`
- Test: `packages/pack-core/src/types.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Note`, `NoteFrontmatter`, `Manifest`, `ManifestEntry`, `SearchHit`, `DEFAULT_SHELVES`, `META_DIR`

- [ ] **Step 1: Create workspace root**

```json
{
  "name": "personal-context-os",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: Create pack-core package**

`packages/pack-core/package.json`:

```json
{
  "name": "@personal-os/pack-core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./node": {
      "types": "./dist/node.d.ts",
      "import": "./dist/node.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "gray-matter": "^4.0.3"
  }
}
```

`packages/pack-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write failing types smoke test**

`packages/pack-core/src/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SHELVES, META_DIR } from "./types.js";

describe("DEFAULT_SHELVES", () => {
  it("includes the four Personal OS shelves", () => {
    expect(DEFAULT_SHELVES).toEqual([
      "preferences",
      "routines",
      "ai-collaboration",
      "goals",
    ]);
  });

  it("uses _meta as meta dir name", () => {
    expect(META_DIR).toBe("_meta");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd /Users/abhisheksingh/Documents/work/context && npm install && npm test -w @personal-os/pack-core`

Expected: FAIL — cannot find module `./types.js` or similar

- [ ] **Step 5: Implement types**

`packages/pack-core/src/types.ts`:

```ts
export const DEFAULT_SHELVES = [
  "preferences",
  "routines",
  "ai-collaboration",
  "goals",
] as const;

export type DefaultShelf = (typeof DEFAULT_SHELVES)[number];

export const META_DIR = "_meta";
export const PACK_ROOT_NAME = "personal-os";

export interface NoteFrontmatter {
  id: string;
  title: string;
  shelf: string;
  tags: string[];
  created: string;
  updated: string;
}

export interface Note extends NoteFrontmatter {
  body: string;
  /** Relative path inside pack, e.g. preferences/foo.md */
  path: string;
}

export interface ManifestEntry {
  id: string;
  path: string;
  shelf: string;
  title: string;
  updated: string;
}

export interface Manifest {
  version: 1;
  notes: ManifestEntry[];
}

export interface SearchHit {
  id: string;
  title: string;
  path: string;
  shelf: string;
  excerpt: string;
  score: number;
}
```

`packages/pack-core/src/index.ts` (browser-safe — do **not** export `loadPack`):

```ts
export * from "./types.js";
```

`packages/pack-core/src/node.ts` (created empty for now; Task 4 fills it):

```ts
export * from "./index.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w @personal-os/pack-core`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.base.json package-lock.json packages/pack-core
git commit -m "chore: scaffold monorepo and pack-core types"
```

---

### Task 2: Note parse / serialize

**Files:**
- Create: `packages/pack-core/src/note.ts`
- Create: `packages/pack-core/src/note.test.ts`
- Modify: `packages/pack-core/src/index.ts`
- Test: `packages/pack-core/src/note.test.ts`

**Interfaces:**
- Consumes: `Note`, `NoteFrontmatter` from `types.ts`
- Produces: `parseNoteMarkdown(markdown: string, path: string): Note`, `serializeNote(note: Note): string`, `slugifyTitle(title: string): string`, `newNoteId(): string`

- [ ] **Step 1: Write failing tests**

`packages/pack-core/src/note.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseNoteMarkdown, serializeNote, slugifyTitle } from "./note.js";

const sample = `---
id: note_abc
title: Prefer short answers
shelf: preferences
tags:
  - style
created: 2026-09-04T10:00:00.000Z
updated: 2026-09-04T10:00:00.000Z
---

I prefer concise bullet answers over long essays.
`;

describe("parseNoteMarkdown", () => {
  it("parses frontmatter and body", () => {
    const note = parseNoteMarkdown(sample, "preferences/prefer-short-answers.md");
    expect(note.id).toBe("note_abc");
    expect(note.title).toBe("Prefer short answers");
    expect(note.shelf).toBe("preferences");
    expect(note.tags).toEqual(["style"]);
    expect(note.body.trim()).toBe(
      "I prefer concise bullet answers over long essays."
    );
    expect(note.path).toBe("preferences/prefer-short-answers.md");
  });

  it("throws on missing required fields", () => {
    expect(() =>
      parseNoteMarkdown("---\ntitle: x\n---\nbody", "preferences/x.md")
    ).toThrow(/id/i);
  });
});

describe("serializeNote", () => {
  it("round-trips", () => {
    const note = parseNoteMarkdown(sample, "preferences/prefer-short-answers.md");
    const again = parseNoteMarkdown(
      serializeNote(note),
      "preferences/prefer-short-answers.md"
    );
    expect(again).toEqual(note);
  });
});

describe("slugifyTitle", () => {
  it("makes filesystem-safe slugs", () => {
    expect(slugifyTitle("Prefer short answers!")).toBe("prefer-short-answers");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @personal-os/pack-core`

Expected: FAIL — `note.js` not found

- [ ] **Step 3: Implement note.ts**

```ts
import matter from "gray-matter";
import type { Note } from "./types.js";

export function newNoteId(): string {
  return `note_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "note";
}

export function parseNoteMarkdown(markdown: string, path: string): Note {
  const { data, content } = matter(markdown);
  const id = String(data.id ?? "");
  const title = String(data.title ?? "");
  const shelf = String(data.shelf ?? "");
  const created = String(data.created ?? "");
  const updated = String(data.updated ?? "");
  if (!id) throw new Error(`Note missing id: ${path}`);
  if (!title) throw new Error(`Note missing title: ${path}`);
  if (!shelf) throw new Error(`Note missing shelf: ${path}`);
  if (!created) throw new Error(`Note missing created: ${path}`);
  if (!updated) throw new Error(`Note missing updated: ${path}`);
  const tags = Array.isArray(data.tags)
    ? data.tags.map(String)
    : data.tags
      ? [String(data.tags)]
      : [];
  return {
    id,
    title,
    shelf,
    tags,
    created,
    updated,
    body: content.replace(/^\n/, ""),
    path,
  };
}

export function serializeNote(note: Note): string {
  const fm = [
    "---",
    `id: ${note.id}`,
    `title: ${JSON.stringify(note.title)}`,
    `shelf: ${note.shelf}`,
    "tags:",
    ...(note.tags.length ? note.tags.map((t) => `  - ${JSON.stringify(t)}`) : ["  []"]),
    `created: ${note.created}`,
    `updated: ${note.updated}`,
    "---",
    "",
    note.body.trimEnd(),
    "",
  ];
  // Fix empty tags: gray-matter prefers list form
  if (note.tags.length === 0) {
    return [
      "---",
      `id: ${note.id}`,
      `title: ${JSON.stringify(note.title)}`,
      `shelf: ${note.shelf}`,
      "tags: []",
      `created: ${note.created}`,
      `updated: ${note.updated}`,
      "---",
      "",
      note.body.trimEnd(),
      "",
    ].join("\n");
  }
  return [
    "---",
    `id: ${note.id}`,
    `title: ${JSON.stringify(note.title)}`,
    `shelf: ${note.shelf}`,
    "tags:",
    ...note.tags.map((t) => `  - ${JSON.stringify(t)}`),
    `created: ${note.created}`,
    `updated: ${note.updated}`,
    "---",
    "",
    note.body.trimEnd(),
    "",
  ].join("\n");
}
```

Update `index.ts` to export note helpers.

- [ ] **Step 4: Run tests — fix serialize empty-tags dead code if needed**

Run: `npm test -w @personal-os/pack-core`

Expected: PASS. Remove the unused `fm` array branch if you left dead code — keep only the final return paths shown.

- [ ] **Step 5: Commit**

```bash
git add packages/pack-core
git commit -m "feat(pack-core): parse and serialize note markdown"
```

---

### Task 3: Manifest builder + keyword search

**Files:**
- Create: `packages/pack-core/src/manifest.ts`
- Create: `packages/pack-core/src/manifest.test.ts`
- Create: `packages/pack-core/src/search.ts`
- Create: `packages/pack-core/src/search.test.ts`
- Modify: `packages/pack-core/src/index.ts`
- Test: `packages/pack-core/src/manifest.test.ts`, `packages/pack-core/src/search.test.ts`

**Interfaces:**
- Consumes: `Note`, `Manifest`, `SearchHit`
- Produces: `buildManifest(notes: Note[]): Manifest`, `searchNotes(notes: Note[], query: string, shelf?: string): SearchHit[]`

- [ ] **Step 1: Write failing tests**

`manifest.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildManifest } from "./manifest.js";
import type { Note } from "./types.js";

const notes: Note[] = [
  {
    id: "n1",
    title: "A",
    shelf: "preferences",
    tags: [],
    created: "2026-09-04T00:00:00.000Z",
    updated: "2026-09-04T01:00:00.000Z",
    body: "x",
    path: "preferences/a.md",
  },
];

describe("buildManifest", () => {
  it("builds version 1 manifest entries", () => {
    const m = buildManifest(notes);
    expect(m.version).toBe(1);
    expect(m.notes).toEqual([
      {
        id: "n1",
        path: "preferences/a.md",
        shelf: "preferences",
        title: "A",
        updated: "2026-09-04T01:00:00.000Z",
      },
    ]);
  });
});
```

`search.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { searchNotes } from "./search.js";
import type { Note } from "./types.js";

const notes: Note[] = [
  {
    id: "n1",
    title: "Prefer short answers",
    shelf: "preferences",
    tags: ["style"],
    created: "2026-09-04T00:00:00.000Z",
    updated: "2026-09-04T00:00:00.000Z",
    body: "Keep replies concise.",
    path: "preferences/prefer-short-answers.md",
  },
  {
    id: "n2",
    title: "Morning routine",
    shelf: "routines",
    tags: [],
    created: "2026-09-04T00:00:00.000Z",
    updated: "2026-09-04T00:00:00.000Z",
    body: "Coffee then deep work.",
    path: "routines/morning-routine.md",
  },
];

describe("searchNotes", () => {
  it("ranks keyword hits and supports shelf filter", () => {
    const hits = searchNotes(notes, "concise short", "preferences");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].id).toBe("n1");
    expect(hits[0].score).toBeGreaterThan(0);
    expect(hits.every((h) => h.shelf === "preferences")).toBe(true);
  });

  it("returns empty list when nothing matches", () => {
    expect(searchNotes(notes, "zzzz-no-match")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -w @personal-os/pack-core`

- [ ] **Step 3: Implement**

`manifest.ts`:

```ts
import type { Manifest, Note } from "./types.js";

export function buildManifest(notes: Note[]): Manifest {
  return {
    version: 1,
    notes: notes.map((n) => ({
      id: n.id,
      path: n.path,
      shelf: n.shelf,
      title: n.title,
      updated: n.updated,
    })),
  };
}
```

`search.ts`:

```ts
import type { Note, SearchHit } from "./types.js";

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function excerpt(body: string, max = 160): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}

export function searchNotes(
  notes: Note[],
  query: string,
  shelf?: string
): SearchHit[] {
  const tokens = tokenize(query);
  const filtered = shelf ? notes.filter((n) => n.shelf === shelf) : notes;
  if (tokens.length === 0) {
    return filtered.map((n) => ({
      id: n.id,
      title: n.title,
      path: n.path,
      shelf: n.shelf,
      excerpt: excerpt(n.body),
      score: 0,
    }));
  }
  const hits: SearchHit[] = [];
  for (const n of filtered) {
    const hay = `${n.title} ${n.tags.join(" ")} ${n.body}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (n.title.toLowerCase().includes(t)) score += 3;
      if (n.tags.some((tag) => tag.toLowerCase().includes(t))) score += 2;
      if (hay.includes(t)) score += 1;
    }
    if (score > 0) {
      hits.push({
        id: n.id,
        title: n.title,
        path: n.path,
        shelf: n.shelf,
        excerpt: excerpt(n.body),
        score,
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
```

Export from `index.ts`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -w @personal-os/pack-core`

- [ ] **Step 5: Commit**

```bash
git add packages/pack-core
git commit -m "feat(pack-core): manifest builder and keyword search"
```

---

### Task 4: Load pack from filesystem + fixture

**Files:**
- Create: `packages/pack-core/src/loadPack.ts`
- Create: `packages/pack-core/src/loadPack.test.ts`
- Create: `fixtures/personal-os/preferences/prefer-short-answers.md`
- Create: `fixtures/personal-os/routines/morning-routine.md`
- Create: `fixtures/personal-os/ai-collaboration/confirm-before-push.md`
- Create: `fixtures/personal-os/goals/ship-v1.md`
- Create: `fixtures/personal-os/_meta/manifest.json` (can be generated in test or checked in)
- Modify: `packages/pack-core/package.json` (add `@types/node` if needed)
- Modify: `packages/pack-core/src/index.ts`
- Test: `packages/pack-core/src/loadPack.test.ts`

**Interfaces:**
- Consumes: `parseNoteMarkdown`, `buildManifest`, `META_DIR`
- Produces: `loadPackFromDir(packDir: string): Promise<{ notes: Note[]; errors: string[] }>`, `listShelves(notes: Note[], packDir?: string): string[]`

- [ ] **Step 1: Write fixture notes**

`fixtures/personal-os/preferences/prefer-short-answers.md`:

```markdown
---
id: note_pref_short
title: Prefer short answers
shelf: preferences
tags:
  - style
created: 2026-09-04T10:00:00.000Z
updated: 2026-09-04T10:00:00.000Z
---

I prefer concise bullet answers over long essays.
```

Add similarly short files for the other three shelves (unique ids, matching `shelf` and folder names).

- [ ] **Step 2: Write failing loadPack test**

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackFromDir, listShelves } from "./loadPack.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/personal-os"
);

describe("loadPackFromDir", () => {
  it("loads notes from shelf folders and skips _meta", async () => {
    const { notes, errors } = await loadPackFromDir(root);
    expect(errors).toEqual([]);
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(listShelves(notes)).toEqual(
      expect.arrayContaining([
        "preferences",
        "routines",
        "ai-collaboration",
        "goals",
      ])
    );
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement loadPack.ts**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { parseNoteMarkdown } from "./note.js";
import { META_DIR, type Note } from "./types.js";

export async function loadPackFromDir(
  packDir: string
): Promise<{ notes: Note[]; errors: string[] }> {
  const notes: Note[] = [];
  const errors: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(packDir);
  } catch (e) {
    throw new Error(
      `Pack path missing or unreadable: ${packDir} (${(e as Error).message})`
    );
  }
  for (const name of entries) {
    if (name === META_DIR || name.startsWith(".")) continue;
    const shelfPath = path.join(packDir, name);
    const st = await fs.stat(shelfPath);
    if (!st.isDirectory()) continue;
    const files = await fs.readdir(shelfPath);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const rel = `${name}/${file}`;
      const abs = path.join(shelfPath, file);
      try {
        const md = await fs.readFile(abs, "utf8");
        notes.push(parseNoteMarkdown(md, rel));
      } catch (e) {
        errors.push(`${rel}: ${(e as Error).message}`);
      }
    }
  }
  return { notes, errors };
}

export function listShelves(notes: Note[]): string[] {
  return [...new Set(notes.map((n) => n.shelf))].sort();
}
```

Hand-write `fixtures/personal-os/_meta/manifest.json` with the four entries matching the fixture files.

Update `packages/pack-core/src/node.ts`:

```ts
export * from "./index.js";
export * from "./loadPack.js";
```

MCP and Node tests import loaders from `@personal-os/pack-core/node`. Capture app imports only `@personal-os/pack-core` (browser-safe).

- [ ] **Step 5: Run tests — PASS**

Run: `npm test -w @personal-os/pack-core`

- [ ] **Step 6: Commit**

```bash
git add packages/pack-core fixtures
git commit -m "feat(pack-core): load personal-os pack from disk"
```

---

### Task 5: Context MCP tools + HTTP API

**Files:**
- Create: `apps/context-mcp/package.json`
- Create: `apps/context-mcp/tsconfig.json`
- Create: `apps/context-mcp/src/config.ts`
- Create: `apps/context-mcp/src/packService.ts`
- Create: `apps/context-mcp/src/httpApi.ts`
- Create: `apps/context-mcp/src/mcpTools.ts`
- Create: `apps/context-mcp/src/server.ts`
- Create: `apps/context-mcp/src/packService.test.ts`
- Create: `apps/context-mcp/README.md`
- Test: `apps/context-mcp/src/packService.test.ts`

**Interfaces:**
- Consumes: `loadPackFromDir`, `listShelves`, `searchNotes`, `Note` from `@personal-os/pack-core`
- Produces:
  - `resolvePackPath(): string` — from `PERSONAL_OS_PACK_PATH` env or `--pack`
  - `createPackService(packDir: string)` → `{ listShelves(), searchContext(query, shelf?), getNote(idOrPath), reload() }`
  - HTTP: `GET /health`, `GET /shelves`, `GET /search?q=&shelf=`, `GET /notes/:idOrPath`
  - MCP tools with the same names/semantics as the spec

- [ ] **Step 1: Scaffold context-mcp package**

`apps/context-mcp/package.json`:

```json
{
  "name": "@personal-os/context-mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "personal-os-mcp": "./dist/server.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "dev": "tsx src/server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@personal-os/pack-core": "*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Add workspace dependency; run `npm install` from root.

- [ ] **Step 2: Write packService test (failing)**

```ts
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPackService } from "./packService.js";

const packDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/personal-os"
);

describe("createPackService", () => {
  it("lists shelves, searches, and gets note", async () => {
    const svc = await createPackService(packDir);
    const shelves = svc.listShelves();
    expect(shelves).toContain("preferences");
    const hits = svc.searchContext("concise", "preferences");
    expect(hits[0].title).toMatch(/short/i);
    const note = svc.getNote("note_pref_short");
    expect(note?.body).toMatch(/concise/i);
    expect(svc.getNote("preferences/prefer-short-answers.md")?.id).toBe(
      "note_pref_short"
    );
  });
});
```

- [ ] **Step 3: Implement packService + config**

`config.ts`:

```ts
export function resolvePackPath(argv = process.argv, env = process.env): string {
  const flagIdx = argv.indexOf("--pack");
  if (flagIdx >= 0 && argv[flagIdx + 1]) return argv[flagIdx + 1];
  if (env.PERSONAL_OS_PACK_PATH) return env.PERSONAL_OS_PACK_PATH;
  throw new Error(
    "Set PERSONAL_OS_PACK_PATH or pass --pack /path/to/personal-os"
  );
}
```

`packService.ts`:

```ts
import { searchNotes, type Note, type SearchHit } from "@personal-os/pack-core";
import { loadPackFromDir, listShelves } from "@personal-os/pack-core/node";

export async function createPackService(packDir: string) {
  let notes: Note[] = [];
  let loadErrors: string[] = [];

  async function reload() {
    const result = await loadPackFromDir(packDir);
    notes = result.notes;
    loadErrors = result.errors;
  }

  await reload();

  return {
    packDir,
    getLoadErrors: () => loadErrors,
    reload,
    listShelves: () => listShelves(notes),
    searchContext: (query: string, shelf?: string): SearchHit[] =>
      searchNotes(notes, query, shelf),
    getNote: (idOrPath: string): Note | undefined =>
      notes.find((n) => n.id === idOrPath || n.path === idOrPath),
  };
}

export type PackService = Awaited<ReturnType<typeof createPackService>>;
```

- [ ] **Step 4: Run packService test — PASS**

Run: `npm test -w @personal-os/context-mcp`

- [ ] **Step 5: Implement HTTP API**

`httpApi.ts` — create Node `http` server:

- `GET /health` → `{ ok: true }`
- `GET /shelves` → `{ shelves: string[] }`
- `GET /search?q=&shelf=` → `{ hits: SearchHit[], hint?: string }` — if hits empty, include `hint: "Broaden query or drop shelf filter"`
- `GET /notes/*` → full note JSON or 404

Listen on `PORT` env default `8787`.

- [ ] **Step 6: Implement MCP tools + server entry**

Use `@modelcontextprotocol/sdk` stdio transport. Register tools:

- `list_shelves` — no args
- `search_context` — `{ query: string, shelf?: string }`
- `get_note` — `{ idOrPath: string }`

On startup: `resolvePackPath()`, `createPackService()`, start MCP stdio; if `--http` flag present also start HTTP.

`README.md` Cursor snippet:

```json
{
  "mcpServers": {
    "personal-os": {
      "command": "node",
      "args": [
        "/ABS/PATH/context/apps/context-mcp/dist/server.js",
        "--pack",
        "/ABS/PATH/to/personal-os"
      ]
    }
  }
}
```

- [ ] **Step 7: Manual smoke**

```bash
npm run build -w @personal-os/pack-core
npm run build -w @personal-os/context-mcp
PERSONAL_OS_PACK_PATH=./fixtures/personal-os node apps/context-mcp/dist/server.js --http
curl -s localhost:8787/shelves
curl -s 'localhost:8787/search?q=concise&shelf=preferences'
```

Expected: JSON shelves and ranked hits.

- [ ] **Step 8: Commit**

```bash
git add apps/context-mcp package-lock.json
git commit -m "feat(context-mcp): MCP tools and HTTP pull API"
```

---

### Task 6: Capture app — localStorage store

**Files:**
- Create: `apps/capture/package.json`
- Create: `apps/capture/tsconfig.json`
- Create: `apps/capture/vite.config.ts`
- Create: `apps/capture/index.html`
- Create: `apps/capture/src/main.tsx`
- Create: `apps/capture/src/App.tsx`
- Create: `apps/capture/src/store/notesStore.ts`
- Create: `apps/capture/src/store/notesStore.test.ts`
- Create: `apps/capture/src/styles.css`
- Test: `apps/capture/src/store/notesStore.test.ts`

**Interfaces:**
- Consumes: `Note`, `DEFAULT_SHELVES`, `newNoteId`, `slugifyTitle`, `serializeNote`, `buildManifest` from pack-core
- Produces: `loadNotes(): Note[]`, `saveNote(input): Note`, `updateNote(id, patch): Note`, `deleteNote(id): void`, `STORAGE_KEY = "personal-os.notes.v1"`

- [ ] **Step 1: Scaffold Vite React TS app in `apps/capture`**

```bash
cd /Users/abhisheksingh/Documents/work/context
npm create vite@latest apps/capture -- --template react-ts
```

Wire workspace name `@personal-os/capture`, depend on `@personal-os/pack-core`, add vitest + jsdom, configure vitest in `vite.config.ts`.

- [ ] **Step 2: Write failing store tests**

Use a mock `localStorage` in vitest:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadNotes,
  saveNote,
  deleteNote,
  STORAGE_KEY,
} from "./notesStore.js";

beforeEach(() => {
  localStorage.clear();
});

describe("notesStore", () => {
  it("saves and reloads notes", () => {
    const note = saveNote({
      title: "Prefer short answers",
      shelf: "preferences",
      body: "Be concise.",
      tags: ["style"],
    });
    expect(note.id).toMatch(/^note_/);
    expect(note.path).toBe("preferences/prefer-short-answers.md");
    expect(loadNotes()).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    deleteNote(note.id);
    expect(loadNotes()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Implement notesStore.ts**

```ts
import {
  DEFAULT_SHELVES,
  newNoteId,
  slugifyTitle,
  type Note,
} from "@personal-os/pack-core";

export const STORAGE_KEY = "personal-os.notes.v1";

export type SaveNoteInput = {
  title: string;
  shelf: string;
  body: string;
  tags?: string[];
};

function readRaw(): Note[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Note[];
}

function writeRaw(notes: Note[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    throw new Error(
      "Storage full. Download your pack, then delete old notes."
    );
  }
}

export function loadNotes(): Note[] {
  return readRaw();
}

export function saveNote(input: SaveNoteInput): Note {
  const now = new Date().toISOString();
  const slug = slugifyTitle(input.title);
  const note: Note = {
    id: newNoteId(),
    title: input.title.trim(),
    shelf: input.shelf,
    tags: input.tags ?? [],
    created: now,
    updated: now,
    body: input.body,
    path: `${input.shelf}/${slug}.md`,
  };
  const notes = readRaw();
  // disambiguate path collisions
  const base = note.path.replace(/\.md$/, "");
  let i = 2;
  while (notes.some((n) => n.path === note.path)) {
    note.path = `${base}-${i}.md`;
    i++;
  }
  notes.push(note);
  writeRaw(notes);
  return note;
}

export function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "shelf" | "body" | "tags">>
): Note {
  const notes = readRaw();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error(`Note not found: ${id}`);
  const prev = notes[idx];
  const next: Note = {
    ...prev,
    ...patch,
    updated: new Date().toISOString(),
  };
  if (patch.title || patch.shelf) {
    next.path = `${next.shelf}/${slugifyTitle(next.title)}.md`;
  }
  notes[idx] = next;
  writeRaw(notes);
  return next;
}

export function deleteNote(id: string): void {
  writeRaw(readRaw().filter((n) => n.id !== id));
}

export { DEFAULT_SHELVES };
```

Note: `newNoteId` uses `crypto.randomUUID` — available in modern browsers and Node 20+.

- [ ] **Step 4: Run store tests — PASS**

Run: `npm test -w @personal-os/capture`

- [ ] **Step 5: Commit**

```bash
git add apps/capture package-lock.json
git commit -m "feat(capture): localStorage notes store"
```

---

### Task 7: Capture UI — form, library, speech fallback

**Files:**
- Create: `apps/capture/src/lib/speech.ts`
- Create: `apps/capture/src/components/CaptureForm.tsx`
- Create: `apps/capture/src/components/NoteLibrary.tsx`
- Modify: `apps/capture/src/App.tsx`
- Modify: `apps/capture/src/styles.css`
- Test: manual browser checklist (below); optional RTL test for form save if time

**Interfaces:**
- Consumes: `saveNote`, `loadNotes`, `updateNote`, `deleteNote`, `DEFAULT_SHELVES`
- Produces: UI flows matching spec § Capture app

- [ ] **Step 1: Implement speech helper**

`speech.ts`:

```ts
export type SpeechController = {
  supported: boolean;
  start: (onText: (text: string) => void, onError: (msg: string) => void) => void;
  stop: () => void;
};

export function createSpeechController(): SpeechController {
  const SR =
    typeof window !== "undefined"
      ? (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition
      : undefined;

  let active: SpeechRecognition | null = null;

  return {
    supported: Boolean(SR),
    start(onText, onError) {
      if (!SR) {
        onError("Speech recognition not supported. Type or paste instead.");
        return;
      }
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (ev: SpeechRecognitionEvent) => {
        let text = "";
        for (let i = 0; i < ev.results.length; i++) {
          text += ev.results[i][0].transcript;
        }
        onText(text.trim());
      };
      rec.onerror = () => onError("Mic error or permission denied. Type or paste instead.");
      active = rec;
      rec.start();
    },
    stop() {
      active?.stop();
      active = null;
    },
  };
}
```

Add minimal `SpeechRecognition` types in a `src/speech-recognition.d.ts` if TypeScript complains.

- [ ] **Step 2: CaptureForm**

Fields: title, shelf `<select>` from `DEFAULT_SHELVES`, body textarea, Record / Stop buttons, Save. On mount show STT unsupported banner when `!supported`. Saving calls `saveNote` and clears form / notifies parent.

- [ ] **Step 3: NoteLibrary**

List notes grouped by shelf; edit title/body/shelf; delete with confirm.

- [ ] **Step 4: Wire App.tsx**

Two sections: Capture + Library. Reload library after save/delete.

- [ ] **Step 5: Manual test**

```bash
npm run dev -w @personal-os/capture
```

Checklist:

1. Type a note → save → appears under shelf  
2. Refresh page → note still there  
3. With mic denied / unsupported → banner + typing still works  

- [ ] **Step 6: Commit**

```bash
git add apps/capture
git commit -m "feat(capture): capture form, library, and speech fallback"
```

---

### Task 8: Zip export + light PWA shell

**Files:**
- Create: `apps/capture/src/lib/exportZip.ts`
- Create: `apps/capture/src/lib/exportZip.test.ts`
- Create: `apps/capture/public/manifest.webmanifest`
- Modify: `apps/capture/index.html` (link manifest)
- Modify: `apps/capture/src/App.tsx` (Download button)
- Modify: `apps/capture/package.json` (dependency `jszip`)
- Test: `apps/capture/src/lib/exportZip.test.ts`

**Interfaces:**
- Consumes: `Note`, `serializeNote`, `buildManifest`, `META_DIR`, `PACK_ROOT_NAME`
- Produces: `async function buildPackZip(notes: Note[]): Promise<Blob>`

- [ ] **Step 1: Write failing export test**

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildPackZip } from "./exportZip.js";
import type { Note } from "@personal-os/pack-core";

const notes: Note[] = [
  {
    id: "n1",
    title: "Prefer short answers",
    shelf: "preferences",
    tags: [],
    created: "2026-09-04T00:00:00.000Z",
    updated: "2026-09-04T00:00:00.000Z",
    body: "Be concise.",
    path: "preferences/prefer-short-answers.md",
  },
];

describe("buildPackZip", () => {
  it("includes note markdown and manifest under personal-os/", async () => {
    const blob = await buildPackZip(notes);
    const zip = await JSZip.loadAsync(blob);
    const md = await zip
      .file("personal-os/preferences/prefer-short-answers.md")!
      .async("string");
    expect(md).toContain("note_");
    expect(md).toContain("Be concise.");
    const manifest = JSON.parse(
      await zip.file("personal-os/_meta/manifest.json")!.async("string")
    );
    expect(manifest.version).toBe(1);
    expect(manifest.notes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement exportZip.ts**

```ts
import JSZip from "jszip";
import {
  buildManifest,
  serializeNote,
  PACK_ROOT_NAME,
  META_DIR,
  type Note,
} from "@personal-os/pack-core";

export async function buildPackZip(notes: Note[]): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(PACK_ROOT_NAME)!;
  for (const note of notes) {
    root.file(note.path, serializeNote(note));
  }
  root.folder(META_DIR)!.file(
    "manifest.json",
    JSON.stringify(buildManifest(notes), null, 2)
  );
  return zip.generateAsync({ type: "blob" });
}

export function downloadPackZip(blob: Blob, filename = "personal-os.zip") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: Tests PASS; wire Download in App**

On click: `buildPackZip(loadNotes())` then `downloadPackZip(blob)`.

- [ ] **Step 4: PWA manifest**

`public/manifest.webmanifest`:

```json
{
  "name": "Personal Context OS",
  "short_name": "Personal OS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f1419",
  "theme_color": "#0f1419"
}
```

Link in `index.html`. Full offline service worker is optional for v1 (spec: desirable, not blocker).

- [ ] **Step 5: Manual E2E handoff**

1. Save 2+ notes in the PWA  
2. Download zip → unzip to `~/personal-os` (folder should contain shelves + `_meta`)  
3. Point MCP: `PERSONAL_OS_PACK_PATH=~/personal-os npm start -w @personal-os/context-mcp -- --http`  
4. `curl` search; configure Cursor MCP per `apps/context-mcp/README.md`  
5. Ask an agent to call `search_context` for a known preference  

- [ ] **Step 6: Commit**

```bash
git add apps/capture
git commit -m "feat(capture): zip export and PWA manifest"
```

---

### Task 9: Documentation suite + verification sweep

**Files:**
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `docs/architecture.md`
- Create: `docs/pack-format.md`
- Create: `docs/mcp-and-api.md`
- Create: `docs/development.md`
- Create: `packages/pack-core/README.md`
- Modify: `apps/context-mcp/README.md` (ensure Cursor config + link to `docs/mcp-and-api.md`)
- Create: `apps/capture/README.md`
- Test: none beyond `npm test` verification

**Interfaces:** none — docs must match shipped code (package names, env vars, tool names, pack layout).

- [ ] **Step 1: Write root README.md**

Must include:

- What it is (2–3 sentences) and privacy posture (local-only v1)
- Repo map: `packages/pack-core`, `apps/capture`, `apps/context-mcp`, `fixtures/`
- Quickstart: `npm install` → capture dev → export zip → point MCP `--pack` → Cursor snippet
- Links to: design spec, this plan, and every file under `docs/`
- Node version note (20+)

- [ ] **Step 2: Write docs/architecture.md**

Must include:

- Component diagram (capture ↔ pack files ↔ MCP/HTTP ↔ agents) in mermaid or ASCII
- Responsibility of each package/app
- Why pack files are the contract (and what that means for future Drive sync)
- Request/data flow for capture-save and for `search_context`
- Explicit non-goals / deferred work (point at design spec decision log)

- [ ] **Step 3: Write docs/pack-format.md**

Must include:

- Directory layout with example tree
- Frontmatter field table (`id`, `title`, `shelf`, `tags`, `created`, `updated`) with types and rules
- Manifest schema (`version: 1`, `notes[]`)
- Atomic-note guidance (one idea per file)
- How to add a custom shelf safely
- Versioning rules: when to bump manifest `version`, what is backward compatible
- Example note file (full markdown)

- [ ] **Step 4: Write docs/mcp-and-api.md**

Must include:

- Env/flags: `PERSONAL_OS_PACK_PATH`, `--pack`, `--http`, `PORT` (default 8787)
- MCP tools table: name, args, return shape, errors
- HTTP endpoints table: method/path/query, status codes, example `curl`
- Empty-search hint behavior
- Corrupt-file skip behavior
- Cursor MCP config example (absolute paths)
- Troubleshooting: wrong pack path (parent vs `personal-os/` folder), stale export

- [ ] **Step 5: Write docs/development.md**

Must include:

- Monorepo scripts (`npm test`, build per workspace)
- How to run focused tests per package
- TDD expectation for `pack-core` changes
- How to add a default shelf (types + capture UI + docs + fixture)
- How to add an MCP tool (packService → mcpTools → httpApi → docs)
- Release checklist: tests green, CHANGELOG entry, pack-format compatibility note
- Where design/plan live under `docs/superpowers/`

- [ ] **Step 6: Write package READMEs + CHANGELOG**

`packages/pack-core/README.md`: public exports (`.` vs `./node`), main functions, "do not import `./node` from the browser".

`apps/capture/README.md`: dev server, STT caveats, storage key, export flow.

`apps/context-mcp/README.md`: run/build, Cursor config, link to `docs/mcp-and-api.md`.

`CHANGELOG.md`: Keep-a-Changelog format with an `[Unreleased]` / `0.1.0` section describing v1 capabilities.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all workspace tests PASS

- [ ] **Step 8: Commit**

```bash
git add README.md CHANGELOG.md docs/architecture.md docs/pack-format.md docs/mcp-and-api.md docs/development.md packages/pack-core/README.md apps/capture/README.md apps/context-mcp/README.md
git commit -m "docs: architecture, pack format, MCP/API, and developer guides"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Speak + type/paste capture | Task 7 |
| localStorage persistence | Task 6 |
| Topic shelves + atomic markdown | Tasks 1–2, 6–7 |
| Zip download with manifest | Task 8 |
| MCP list/search/get | Task 5 |
| HTTP pull API | Task 5 |
| Keyword + shelf ranking | Task 3 |
| Fixture / automated MCP tests | Tasks 4–5 |
| Manual agent E2E | Task 8 step 5 |
| Maintainability documentation | Task 9 |
| No Drive/accounts/embeddings | Global constraints |

## Self-review notes

- Fixed serializeNote dead-code risk called out in Task 2 — implementer must ship only the clean return paths.  
- Split `@personal-os/pack-core` (browser) vs `@personal-os/pack-core/node` (fs loader) so Vite never bundles `node:fs`.  
- `newNoteId` / `crypto.randomUUID` requires modern runtime (Node 20+ / current browsers).  
- Pack path for unzipped download: user may unzip to a folder named `personal-os`; MCP `--pack` must point at that folder (the one containing shelf dirs), not its parent.
