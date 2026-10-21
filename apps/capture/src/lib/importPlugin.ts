import {
  DEFAULT_SHELVES,
  parseShelves,
  type Note,
  type PackShelf,
} from "@personal-os/pack-core";
import { parseNoteMarkdown } from "@personal-os/pack-core/parse";
import JSZip from "jszip";

export const NOT_A_PACK = "This file is not a Personal OS plugin or pack.";

const BUILTIN = new Set<string>(DEFAULT_SHELVES);

export type ImportPreview = {
  notesToAdd: Note[];
  notesToUpdate: Note[];
  unchangedCount: number;
  browserOnlyCount: number;
  shelvesToAdd: PackShelf[];
  shelvesToUpdate: PackShelf[];
  skippedCount: number;
  shelvesFromFolders: boolean;
  canConfirm: boolean;
};

function sameTags(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedRight = [...right].sort();
  return [...left].sort().every((tag, index) => tag === sortedRight[index]);
}

function sameNote(left: Note, right: Note): boolean {
  return (
    left.title === right.title &&
    left.body === right.body &&
    left.shelf === right.shelf &&
    left.path === right.path &&
    sameTags(left.tags, right.tags)
  );
}

function sameShelf(left: PackShelf, right: PackShelf): boolean {
  return (
    left.name === right.name &&
    left.description === right.description &&
    left.color.toLowerCase() === right.color.toLowerCase() &&
    left.order === right.order
  );
}

function fallbackShelf(slug: string, order: number): PackShelf {
  return {
    slug,
    name: slug,
    description: slug,
    color: "#0f6e6e",
    order,
    isDefault: BUILTIN.has(slug),
  };
}

function isZipJunk(path: string): boolean {
  return path.split("/").some((part) => part === "__MACOSX" || part.startsWith("._"));
}

function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path)) return path;
  const base = path.replace(/\.md$/, "");
  let i = 2;
  let next = `${base}-${i}.md`;
  while (used.has(next)) {
    i += 1;
    next = `${base}-${i}.md`;
  }
  return next;
}

export function findPackPrefix(paths: string[]): string | null {
  const normalized = paths
    .map((item) => item.replaceAll("\\", "/"))
    .filter((item) => !isZipJunk(item));
  for (const marker of ["plugin/personal-os/", "personal-os/"]) {
    const hit = normalized.find((item) => item.includes(`/${marker}`) || item.startsWith(marker));
    if (hit) return hit.slice(0, hit.indexOf(marker) + marker.length);
  }
  return null;
}

export async function previewPluginImport(
  zipBytes: ArrayBuffer,
  currentNotes: Note[],
  currentShelves: PackShelf[]
): Promise<ImportPreview> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch {
    throw new Error(NOT_A_PACK);
  }
  const paths = Object.keys(zip.files).filter((item) => !isZipJunk(item.replaceAll("\\", "/")));
  const prefix = findPackPrefix(paths);
  if (!prefix) throw new Error(NOT_A_PACK);

  const relative = paths
    .filter((item) => item.startsWith(prefix) && !zip.files[item].dir)
    .map((item) => item.slice(prefix.length));

  let shelvesFromFolders = false;
  let parsedShelves: PackShelf[] = [];
  const shelfJson = relative.find((item) => item === "_meta/shelves.json");
  if (shelfJson) {
    try {
      parsedShelves = parseShelves(await zip.file(prefix + shelfJson)!.async("string"));
    } catch {
      shelvesFromFolders = true;
    }
  } else {
    shelvesFromFolders = true;
  }

  const folderSlugs = [
    ...new Set(
      relative
        .filter((item) => item.split("/").length >= 2 && !item.startsWith("_meta/"))
        .map((item) => item.split("/")[0])
    ),
  ].sort();
  const known = new Set(parsedShelves.map((shelf) => shelf.slug));
  const fallbackSlugs = new Set<string>();
  const orderFloor = Math.max(
    0,
    ...currentShelves.map((shelf) => shelf.order),
    ...parsedShelves.map((shelf) => shelf.order)
  );
  folderSlugs.forEach((slug) => {
    if (known.has(slug)) return;
    fallbackSlugs.add(slug);
    parsedShelves.push(fallbackShelf(slug, orderFloor + fallbackSlugs.size));
  });

  const seen = new Set<string>();
  const incoming: Note[] = [];
  let skippedCount = 0;
  let noteFileCount = 0;
  for (const relativePath of relative) {
    if (!relativePath.endsWith(".md") || relativePath.startsWith("_meta/")) continue;
    if (relativePath.split("/").length !== 2) continue;
    noteFileCount += 1;
    try {
      const markdown = await zip.file(prefix + relativePath)!.async("string");
      const parsed = parseNoteMarkdown(markdown, relativePath);
      if (seen.has(parsed.id)) {
        skippedCount += 1;
        continue;
      }
      seen.add(parsed.id);
      incoming.push(parsed);
    } catch {
      skippedCount += 1;
    }
  }

  const currentById = new Map(currentNotes.map((item) => [item.id, item]));
  const notesToAdd = incoming.filter((item) => !currentById.has(item.id));
  const notesToUpdate = incoming.filter((item) => {
    const current = currentById.get(item.id);
    return current !== undefined && !sameNote(current, item);
  });
  const unchangedCount = incoming.length - notesToAdd.length - notesToUpdate.length;
  const browserOnlyCount = currentNotes.filter((item) => !seen.has(item.id)).length;

  const currentShelfBySlug = new Map(currentShelves.map((item) => [item.slug, item]));
  const shelvesToAdd = parsedShelves.filter((item) => !currentShelfBySlug.has(item.slug));
  const shelvesToUpdate = parsedShelves.filter((item) => {
    if (fallbackSlugs.has(item.slug)) return false;
    const current = currentShelfBySlug.get(item.slug);
    return current !== undefined && !sameShelf(current, item);
  });
  const allNotesFailed = noteFileCount > 0 && incoming.length === 0;
  const changes =
    notesToAdd.length + notesToUpdate.length + shelvesToAdd.length + shelvesToUpdate.length;

  return {
    notesToAdd,
    notesToUpdate,
    unchangedCount,
    browserOnlyCount,
    shelvesToAdd,
    shelvesToUpdate,
    skippedCount,
    shelvesFromFolders,
    canConfirm: changes > 0 && !allNotesFailed,
  };
}

export function mergeImportedNotes(current: Note[], preview: ImportPreview): Note[] {
  const updates = new Map(preview.notesToUpdate.map((item) => [item.id, item]));
  const used = new Set(current.filter((item) => !updates.has(item.id)).map((item) => item.path));
  const place = (note: Note): Note => {
    const path = uniquePath(note.path, used);
    used.add(path);
    return path === note.path ? note : { ...note, path };
  };
  return [
    ...current.map((item) => {
      const next = updates.get(item.id);
      return next ? place(next) : item;
    }),
    ...preview.notesToAdd.map(place),
  ];
}

export function mergeImportedShelves(current: PackShelf[], preview: ImportPreview): PackShelf[] {
  const map = new Map(current.map((item) => [item.slug, item]));
  for (const shelf of [...preview.shelvesToAdd, ...preview.shelvesToUpdate]) {
    map.set(shelf.slug, { ...shelf, isDefault: BUILTIN.has(shelf.slug) });
  }
  return [...map.values()].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
}
