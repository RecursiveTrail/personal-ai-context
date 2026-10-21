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
    expect(preview.shelvesToUpdate).toEqual([]);

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

  it("does not replace existing shelf details when the pack has no shelves file", async () => {
    const bytes = await zipWith({
      "personal-os/preferences/prefer-short-answers.md": serializeNote(note({})),
      "__MACOSX/personal-os/preferences/._prefer-short-answers.md": "junk",
    });
    const preview = await previewPluginImport(bytes, [], [preferences]);
    expect(preview.shelvesToUpdate).toEqual([]);
    expect(preview.shelvesToAdd).toEqual([]);
    expect(preview.notesToAdd).toHaveLength(1);
  });

  it("gives an added note a new path when that path is already in this browser", () => {
    const local = note({ id: "note_local", title: "Stay", path: "preferences/prefer-short-answers.md" });
    const preview = {
      notesToAdd: [note({ id: "note_new", title: "New" })],
      notesToUpdate: [],
      unchangedCount: 0,
      browserOnlyCount: 1,
      shelvesToAdd: [],
      shelvesToUpdate: [],
      skippedCount: 0,
      shelvesFromFolders: true,
      canConfirm: true,
    };
    expect(mergeImportedNotes([local], preview).map((item) => item.path)).toEqual([
      "preferences/prefer-short-answers.md",
      "preferences/prefer-short-answers-2.md",
    ]);
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
