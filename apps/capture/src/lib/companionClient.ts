import type { Note } from "@personal-os/pack-core";

export const DEFAULT_COMPANION_BASE = "http://127.0.0.1:8787";

const HEALTH_TIMEOUT_MS = 1500;
const SYNC_TIMEOUT_MS = 5000;

export async function fetchCompanionHealth(
  base: string = DEFAULT_COMPANION_BASE
): Promise<{ ok: boolean; notes?: number }> {
  const response = await fetch(`${base}/health`, {
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Companion health failed: ${response.status}`);
  return (await response.json()) as { ok: boolean; notes?: number };
}

export async function syncNotesWithCompanion(
  notes: Note[],
  base: string = DEFAULT_COMPANION_BASE
): Promise<Note[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/sync`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Companion sync failed: ${response.status}`);
    const data = (await response.json()) as { notes?: Note[] };
    if (!Array.isArray(data.notes)) throw new Error("Companion sync returned no notes");
    return data.notes;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Best-effort `DELETE /notes/:id` after a local delete so the next sync does not restore the
 * note. Never throws; resolves false when the companion is down or the note was not there.
 */
export async function deleteNoteOnCompanion(
  id: string,
  base: string = DEFAULT_COMPANION_BASE
): Promise<boolean> {
  try {
    const response = await fetch(`${base}/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
