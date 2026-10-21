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
