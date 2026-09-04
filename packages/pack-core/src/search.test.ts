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

  it("returns empty list for a non-blank query with no searchable tokens", () => {
    expect(searchNotes(notes, "! @ #")).toEqual([]);
  });

  it("returns all notes for a blank query", () => {
    expect(searchNotes(notes, " \t\n")).toHaveLength(notes.length);
  });
});
