import type { Note } from "@personal-os/pack-core";
import { formatNoteUpdated, shelfLabel, wordCount } from "../display.js";
import type { ShelfRecord } from "../store/shelvesStore.js";

type LedgerViewProps = {
  notes: Note[];
  shelves: ShelfRecord[];
  onOpenShelf: (slug: string) => void;
};

export function LedgerView({ notes, shelves, onOpenShelf }: LedgerViewProps) {
  const known = new Set(shelves.map((shelf) => shelf.slug));
  const groups = [
    ...shelves.map((shelf) => ({
      slug: shelf.slug,
      name: shelf.name,
    })),
    ...notes
      .map((note) => note.shelf)
      .filter((slug, index, all) => !known.has(slug) && all.indexOf(slug) === index)
      .map((slug) => ({ slug, name: shelfLabel(slug) })),
  ].filter((group) => notes.some((note) => note.shelf === group.slug));

  return (
    <section className="ledgerView" aria-labelledby="ledger-heading">
      <p className="eyebrow">Index</p>
      <h2 id="ledger-heading">Ledger</h2>
      <p>
        {notes.length} {notes.length === 1 ? "note" : "notes"} in this browser.
      </p>
      {notes.length === 0 ? (
        <p className="emptyState">No notes yet. Capture one from the desk.</p>
      ) : (
        groups.map((group) => (
          <section key={group.slug} className="ledgerGroup">
            <h3>{group.name}</h3>
            <ul>
              {notes
                .filter((note) => note.shelf === group.slug)
                .sort((a, b) => b.updated.localeCompare(a.updated))
                .map((note) => (
                  <li key={note.id}>
                    <button type="button" onClick={() => onOpenShelf(group.slug)}>
                      <strong>{note.title}</strong>
                      <span>
                        {formatNoteUpdated(note.updated)} · {wordCount(note.body)}{" "}
                        {wordCount(note.body) === 1 ? "word" : "words"}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
