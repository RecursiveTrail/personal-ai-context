import matter from "gray-matter";
import type { Note } from "./types.js";

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
