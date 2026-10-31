import { fetchCompanionHealth, syncNotesWithCompanion } from "./companionClient.js";
import { loadNotes, replaceNotes } from "../store/notesStore.js";
import type { Note } from "@personal-os/pack-core";

function notesVersion(notes: Note[]): string {
  return JSON.stringify(
    notes
      .map(({ id, updated }) => ({ id, updated }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}

/** Sync browser notes with the localhost companion; never throws. */
export async function maybeSyncNotes(): Promise<"offline" | "synced"> {
  try {
    const health = await fetchCompanionHealth();
    if (!health.ok) return "offline";
    let snapshot = loadNotes();
    let merged = await syncNotesWithCompanion(snapshot);
    let current = loadNotes();

    if (notesVersion(current) !== notesVersion(snapshot)) {
      snapshot = current;
      merged = await syncNotesWithCompanion(snapshot);
      current = loadNotes();
      if (notesVersion(current) !== notesVersion(snapshot)) return "offline";
    }

    replaceNotes(merged);
    return "synced";
  } catch {
    return "offline";
  }
}
