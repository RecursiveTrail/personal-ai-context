import type { Manifest, Note } from "./types.js";

export function buildManifest(notes: Note[]): Manifest {
  return {
    version: 1,
    notes: notes.map((n) => ({
      id: n.id,
      path: n.path,
      shelf: n.shelf,
      title: n.title,
      updated: n.updated,
    })),
  };
}
