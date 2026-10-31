import type { Note } from "../lib/tauriApi";

type Props = {
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
};

export function NoteList({ notes, selectedId, onSelect, onNew }: Props) {
  return (
    <section className="notes" aria-label="Notes">
      <header>
        <h2>Notes</h2>
        <button type="button" onClick={onNew}>
          New note
        </button>
      </header>
      {notes.length === 0 ? (
        <p className="muted">No notes here yet.</p>
      ) : (
        <ul>
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                aria-pressed={selectedId === note.id}
                onClick={() => onSelect(note.id)}
              >
                <span className="note-title">{note.title || "Untitled"}</span>
                <span className="note-meta">{note.shelf}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
