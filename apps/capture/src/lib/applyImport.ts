import type { Note } from "@personal-os/pack-core";
import { replaceNotes } from "../store/notesStore.js";
import { saveShelves, type ShelfRecord } from "../store/shelvesStore.js";
import { mergeImportedNotes, mergeImportedShelves, type ImportPreview } from "./importPlugin.js";

type ImportWriters = {
  writeNotes: (notes: Note[]) => void;
  writeShelves: (shelves: ShelfRecord[]) => void;
};

export function applyConfirmedImport(
  currentNotes: Note[],
  currentShelves: ShelfRecord[],
  preview: ImportPreview,
  writers: ImportWriters = { writeNotes: replaceNotes, writeShelves: saveShelves }
): { notes: Note[]; shelves: ShelfRecord[] } {
  const notes = mergeImportedNotes(currentNotes, preview);
  const shelves = mergeImportedShelves(currentShelves, preview);
  writers.writeNotes(notes);
  writers.writeShelves(shelves);
  return { notes, shelves };
}
