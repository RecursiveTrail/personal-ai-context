import { searchNotes, type Note, type SearchHit } from "@personal-os/pack-core";
import { listShelves, loadPackFromDir } from "@personal-os/pack-core/node";

export async function createPackService(packDir: string) {
  let notes: Note[] = [];
  let shelfDirs: string[] = [];
  let loadErrors: string[] = [];

  async function reload(): Promise<void> {
    const result = await loadPackFromDir(packDir);
    notes = result.notes;
    shelfDirs = result.shelfDirs;
    loadErrors = result.errors;
  }

  await reload();

  return {
    packDir,
    getLoadErrors: (): string[] => loadErrors,
    getNoteCount: (): number => notes.length,
    reload,
    listShelves: (): string[] => listShelves(notes, shelfDirs),
    searchContext: (query: string, shelf?: string): SearchHit[] =>
      searchNotes(notes, query, shelf),
    getNote: (idOrPath: string): Note | undefined =>
      notes.find((note) => note.id === idOrPath || note.path === idOrPath),
  };
}

export type PackService = Awaited<ReturnType<typeof createPackService>>;
