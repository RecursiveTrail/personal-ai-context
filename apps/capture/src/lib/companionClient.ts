import type { Note } from "@personal-os/pack-core";

export const DEFAULT_COMPANION_BASE = "http://127.0.0.1:8787";

const HEALTH_TIMEOUT_MS = 1500;

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
  const response = await fetch(`${base}/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notes }),
  });
  if (!response.ok) throw new Error(`Companion sync failed: ${response.status}`);
  const data = (await response.json()) as { notes?: Note[] };
  if (!Array.isArray(data.notes)) throw new Error("Companion sync returned no notes");
  return data.notes;
}
