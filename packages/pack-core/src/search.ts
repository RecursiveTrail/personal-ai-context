import type { Note, SearchHit } from "./types.js";

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function excerpt(body: string, max = 160): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}

export function searchNotes(
  notes: Note[],
  query: string,
  shelf?: string
): SearchHit[] {
  const tokens = tokenize(query);
  const filtered = shelf ? notes.filter((n) => n.shelf === shelf) : notes;
  if (tokens.length === 0) {
    if (query.trim().length > 0) return [];
    return filtered.map((n) => ({
      id: n.id,
      title: n.title,
      path: n.path,
      shelf: n.shelf,
      excerpt: excerpt(n.body),
      score: 0,
    }));
  }
  const hits: SearchHit[] = [];
  for (const n of filtered) {
    const hay = `${n.title} ${n.tags.join(" ")} ${n.body}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (n.title.toLowerCase().includes(t)) score += 3;
      if (n.tags.some((tag) => tag.toLowerCase().includes(t))) score += 2;
      if (hay.includes(t)) score += 1;
    }
    if (score > 0) {
      hits.push({
        id: n.id,
        title: n.title,
        path: n.path,
        shelf: n.shelf,
        excerpt: excerpt(n.body),
        score,
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
