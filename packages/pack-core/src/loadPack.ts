import fs from "node:fs/promises";
import path from "node:path";
import { parseNoteMarkdown } from "./parse.js";
import { META_DIR, type Note } from "./types.js";

export async function loadPackFromDir(
  packDir: string
): Promise<{ notes: Note[]; errors: string[] }> {
  const notes: Note[] = [];
  const errors: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(packDir);
  } catch (e) {
    throw new Error(
      `Pack path missing or unreadable: ${packDir} (${(e as Error).message})`
    );
  }
  for (const name of entries) {
    if (name === META_DIR || name.startsWith(".")) continue;
    const shelfPath = path.join(packDir, name);
    let files: string[];
    try {
      const st = await fs.stat(shelfPath);
      if (!st.isDirectory()) continue;
      files = await fs.readdir(shelfPath);
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const rel = `${name}/${file}`;
      const abs = path.join(shelfPath, file);
      try {
        const md = await fs.readFile(abs, "utf8");
        notes.push(parseNoteMarkdown(md, rel));
      } catch (e) {
        errors.push(`${rel}: ${(e as Error).message}`);
      }
    }
  }
  return { notes, errors };
}

export function listShelves(notes: Note[]): string[] {
  return [...new Set(notes.map((n) => n.shelf))].sort();
}
