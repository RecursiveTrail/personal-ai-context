import {
  DEFAULT_SHELVES,
  newNoteId,
  slugifyTitle,
  type Note,
} from "@personal-os/pack-core";

export const STORAGE_KEY = "personal-os.notes.v1";

export type SaveNoteInput = {
  title: string;
  shelf: string;
  body: string;
  tags?: string[];
};

function readRaw(): Note[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return parsed as Note[];
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function writeRaw(notes: Note[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    throw new Error(
      "Storage full. Download your pack, then delete old notes."
    );
  }
}

export function loadNotes(): Note[] {
  return readRaw();
}

export function saveNote(input: SaveNoteInput): Note {
  const now = new Date().toISOString();
  const slug = slugifyTitle(input.title);
  const note: Note = {
    id: newNoteId(),
    title: input.title.trim(),
    shelf: input.shelf,
    tags: input.tags ?? [],
    created: now,
    updated: now,
    body: input.body,
    path: `${input.shelf}/${slug}.md`,
  };
  const notes = readRaw();
  const base = note.path.replace(/\.md$/, "");
  let i = 2;
  while (notes.some((n) => n.path === note.path)) {
    note.path = `${base}-${i}.md`;
    i++;
  }
  notes.push(note);
  writeRaw(notes);
  return note;
}

export function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "shelf" | "body" | "tags">>
): Note {
  const notes = readRaw();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error(`Note not found: ${id}`);
  const prev = notes[idx];
  const next: Note = {
    ...prev,
    ...patch,
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    updated: new Date().toISOString(),
  };
  if (patch.title !== undefined || patch.shelf !== undefined) {
    next.path = `${next.shelf}/${slugifyTitle(next.title)}.md`;
    const base = next.path.replace(/\.md$/, "");
    let i = 2;
    while (notes.some((n) => n.id !== id && n.path === next.path)) {
      next.path = `${base}-${i}.md`;
      i++;
    }
  }
  notes[idx] = next;
  writeRaw(notes);
  return next;
}

export function deleteNote(id: string): void {
  writeRaw(readRaw().filter((n) => n.id !== id));
}

export { DEFAULT_SHELVES };
