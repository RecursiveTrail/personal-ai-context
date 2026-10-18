import { beforeEach, describe, expect, it } from "vitest";
import {
  browserLedgerBytes,
  clearLedger,
  createShelf,
  deleteShelf,
  loadShelves,
  SHELVES_KEY,
  updateShelf,
} from "./shelvesStore.js";
import { saveNote, STORAGE_KEY } from "./notesStore.js";

beforeEach(() => {
  localStorage.clear();
});

describe("shelvesStore", () => {
  it("returns the four default shelves when nothing is stored", () => {
    expect(loadShelves().map((shelf) => shelf.slug)).toEqual([
      "preferences",
      "ai-collaboration",
      "goals",
      "routines",
    ]);
  });

  it("creates a custom shelf and keeps its description out of the note pack key", () => {
    const shelf = createShelf({
      name: "Reading notes",
      description: "Books and papers",
      color: "#246868",
    });
    expect(shelf.slug).toBe("reading-notes");
    expect(loadShelves().map((item) => item.slug)).toContain("reading-notes");
    expect(localStorage.getItem(SHELVES_KEY)).toContain("Books and papers");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("rejects an empty name, a duplicate, and deletion of a default shelf", () => {
    expect(() => createShelf({ name: "   ", description: "", color: "#000" })).toThrow(
      /required/i
    );
    expect(() =>
      createShelf({ name: "Preferences", description: "", color: "#000" })
    ).toThrow(/already exists/i);
    expect(() => deleteShelf("preferences")).toThrow(/default/i);
  });

  it("updates description without changing the slug, and deletes an empty custom shelf", () => {
    const shelf = createShelf({
      name: "Reading notes",
      description: "First",
      color: "#246868",
    });
    const updated = updateShelf(shelf.slug, { description: "Second" });
    expect(updated.slug).toBe("reading-notes");
    expect(updated.description).toBe("Second");
    deleteShelf(shelf.slug);
    expect(loadShelves().some((item) => item.slug === shelf.slug)).toBe(false);
  });

  it("clears notes and shelves and reports ledger bytes", () => {
    saveNote({ title: "Keep", shelf: "preferences", body: "Text" });
    createShelf({ name: "Temp", description: "", color: "#0f6e6e" });
    expect(browserLedgerBytes()).toBeGreaterThan(0);
    clearLedger();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SHELVES_KEY)).toBeNull();
    expect(loadShelves()).toHaveLength(4);
  });
});
