import { fetchCompanionHealth, syncNotesWithCompanion } from "./companionClient.js";
import { loadNotes, replaceNotes } from "../store/notesStore.js";

/** Sync browser notes with the localhost companion; never throws. */
export async function maybeSyncNotes(): Promise<"offline" | "synced"> {
  try {
    const health = await fetchCompanionHealth();
    if (!health.ok) return "offline";
    const merged = await syncNotesWithCompanion(loadNotes());
    replaceNotes(merged);
    return "synced";
  } catch {
    return "offline";
  }
}
