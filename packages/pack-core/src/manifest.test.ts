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
