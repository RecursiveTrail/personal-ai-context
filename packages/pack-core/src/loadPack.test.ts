import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
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
    expect(notes.length).toBe(4);
    expect(listShelves(notes)).toEqual([
      "ai-collaboration",
      "goals",
      "preferences",
      "routines",
    ]);
  });

  it("skips malformed notes into errors while loading valid notes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pack-core-load-"));
    try {
      await fs.mkdir(path.join(dir, "preferences"));
      await fs.writeFile(
        path.join(dir, "preferences", "valid.md"),
        `---
id: note_valid
title: Valid note
shelf: preferences
tags: []
created: 2026-09-04T10:00:00.000Z
updated: 2026-09-04T10:00:00.000Z
---

Body.
`
      );
      await fs.writeFile(
        path.join(dir, "preferences", "bad.md"),
        `---
title: Missing id
shelf: preferences
created: 2026-09-04T10:00:00.000Z
updated: 2026-09-04T10:00:00.000Z
---

Bad.
`
      );
      const { notes, errors } = await loadPackFromDir(dir);
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe("note_valid");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/preferences\/bad\.md/);
      expect(errors[0]).toMatch(/id/i);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("records an unreadable shelf entry and continues loading other shelves", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pack-core-shelf-"));
    try {
      await fs.mkdir(path.join(dir, "preferences"));
      await fs.writeFile(
        path.join(dir, "preferences", "valid.md"),
        `---
id: note_valid
title: Valid note
shelf: preferences
tags: []
created: 2026-09-04T10:00:00.000Z
updated: 2026-09-04T10:00:00.000Z
---

Body.
`
      );
      await fs.symlink(
        path.join(dir, "missing-target"),
        path.join(dir, "broken-shelf")
      );

      const { notes, errors } = await loadPackFromDir(dir);

      expect(notes.map((note) => note.id)).toEqual(["note_valid"]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/broken-shelf/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
