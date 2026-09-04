import { describe, it, expect, beforeEach } from "vitest";
import {
  loadNotes,
  saveNote,
  updateNote,
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

  it("disambiguates path on update when title collides with another note", () => {
    saveNote({ title: "Prefer short answers", shelf: "preferences", body: "A" });
    const second = saveNote({
      title: "Other note",
      shelf: "preferences",
      body: "B",
    });
    const updated = updateNote(second.id, { title: "Prefer short answers" });
    expect(updated.path).toBe("preferences/prefer-short-answers-2.md");
    expect(updated.title).toBe("Prefer short answers");
  });

  it("trims title when patched on update", () => {
    const note = saveNote({ title: "Original", shelf: "preferences", body: "x" });
    const updated = updateNote(note.id, { title: "  Trimmed title  " });
    expect(updated.title).toBe("Trimmed title");
    expect(updated.path).toBe("preferences/trimmed-title.md");
  });

  it("returns empty list and clears corrupt localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(loadNotes()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("returns empty list and clears non-array localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: "not-an-array" }));
    expect(loadNotes()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
