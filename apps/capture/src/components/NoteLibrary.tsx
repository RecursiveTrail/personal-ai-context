import { useState, type FormEvent } from "react";
import type { Note } from "@personal-os/pack-core";
import {
  DEFAULT_SHELVES,
  deleteNote,
  updateNote,
} from "../store/notesStore.js";

type NoteLibraryProps = {
  notes: Note[];
  onChanged: () => void;
};

type NoteEditorProps = {
  note: Note;
  onChanged: () => void;
};

function NoteEditor({ note, onChanged }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [shelf, setShelf] = useState(note.shelf);
  const [body, setBody] = useState(note.body);
  const [message, setMessage] = useState("");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      updateNote(note.id, { title, shelf, body });
      setMessage("");
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update note.");
    }
  }

  function remove() {
    if (!window.confirm(`Delete "${note.title}"?`)) return;
    deleteNote(note.id);
    onChanged();
  }

  return (
    <form className="noteEditor" onSubmit={save}>
      <label>
        Title
        <input
          aria-label={`Title for ${title}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <label>
        Shelf
        <select
          aria-label={`Shelf for ${title}`}
          value={shelf}
          onChange={(event) => setShelf(event.target.value)}
        >
          {DEFAULT_SHELVES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label>
        Note
        <textarea
          aria-label={`Body for ${title}`}
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
        />
      </label>
      {message && (
        <p className="banner bannerError" role="alert">
          {message}
        </p>
      )}
      <div className="actions">
        <button type="submit">Save changes</button>
        <button type="button" className="danger" onClick={remove}>
          Delete
        </button>
      </div>
    </form>
  );
}

export function NoteLibrary({ notes, onChanged }: NoteLibraryProps) {
  if (notes.length === 0) {
    return <p className="emptyState">No notes yet.</p>;
  }

  const knownShelves = DEFAULT_SHELVES.filter((shelf) =>
    notes.some((note) => note.shelf === shelf)
  );
  const additionalShelves = notes
    .map((note) => note.shelf)
    .filter(
      (shelf, index, shelves) =>
        !DEFAULT_SHELVES.includes(
          shelf as (typeof DEFAULT_SHELVES)[number]
        ) && shelves.indexOf(shelf) === index
    );

  return (
    <div className="noteLibrary">
      {[...knownShelves, ...additionalShelves].map((shelf) => (
        <section className="shelf" key={shelf}>
          <h3>{shelf}</h3>
          {notes
            .filter((note) => note.shelf === shelf)
            .map((note) => (
              <NoteEditor
                key={note.id}
                note={note}
                onChanged={onChanged}
              />
            ))}
        </section>
      ))}
    </div>
  );
}
