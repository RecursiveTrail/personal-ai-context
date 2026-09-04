import { describe, it, expect } from "vitest";
import { serializeNote, slugifyTitle } from "./note.js";
import { parseNoteMarkdown } from "./parse.js";

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
