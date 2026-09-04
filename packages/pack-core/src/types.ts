export const DEFAULT_SHELVES = [
  "preferences",
  "routines",
  "ai-collaboration",
  "goals",
] as const;

export type DefaultShelf = (typeof DEFAULT_SHELVES)[number];

export const META_DIR = "_meta";
export const PACK_ROOT_NAME = "personal-os";

export interface NoteFrontmatter {
  id: string;
  title: string;
  shelf: string;
  tags: string[];
  created: string;
  updated: string;
}

export interface Note extends NoteFrontmatter {
  body: string;
  /** Relative path inside pack, e.g. preferences/foo.md */
  path: string;
}

export interface ManifestEntry {
  id: string;
  path: string;
  shelf: string;
  title: string;
  updated: string;
}

export interface Manifest {
  version: 1;
  notes: ManifestEntry[];
}

export interface SearchHit {
  id: string;
  title: string;
  path: string;
  shelf: string;
  excerpt: string;
  score: number;
}
