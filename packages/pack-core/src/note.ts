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

export function serializeNote(note: Note): string {
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
