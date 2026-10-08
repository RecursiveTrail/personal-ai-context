import { useState, type FormEvent } from "react";
import type { Note } from "@personal-os/pack-core";
import { formatNoteUpdated, shelfLabel } from "../display.js";
import {
  DEFAULT_SHELVES,
  deleteNote,
  updateNote,
} from "../store/notesStore.js";
import { TrashIcon } from "./Icons.js";
import { ShelfPicker } from "./ShelfPicker.js";

type NoteLibraryProps = {
  notes: Note[];
  onChanged: () => void;
};

type NoteEditorProps = {
  note: Note;
  onChanged: () => void;
  onCollapse: () => void;
};

function NoteEditor({ note, onChanged, onCollapse }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [shelf, setShelf] = useState(note.shelf);
  const [body, setBody] = useState(note.body);
  const [message, setMessage] = useState("");
  const shelfLabelId = `edit-shelf-label-${note.id}`;

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
    onCollapse();
    onChanged();
  }

  return (
    <form className="noteEditor" onSubmit={save}>
      <div className="field">
        <label className="fieldLabel" htmlFor={`edit-title-${note.id}`}>
          Title
        </label>
        <input
          id={`edit-title-${note.id}`}
          aria-label={`Title for ${title}`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <span className="fieldLabel" id={shelfLabelId}>
          Shelf
        </span>
        <ShelfPicker
          name="edit-shelf"
          value={shelf}
          onChange={setShelf}
          labelId={shelfLabelId}
          compact
        />
      </div>
      <div className="field">
        <label className="fieldLabel" htmlFor={`edit-body-${note.id}`}>
          Note
        </label>
        <textarea
          id={`edit-body-${note.id}`}
          aria-label={`Body for ${title}`}
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
        />
      </div>
      {message ? (
        <p className="banner bannerError" role="alert">
          {message}
        </p>
      ) : null}
      <div className="editorActions">
        <div className="editorButtons">
          <button type="submit" className="buttonPrimary">
            Save changes
          </button>
          <button type="button" className="buttonDanger" onClick={remove}>
            <TrashIcon />
            <span>Delete</span>
          </button>
        </div>
        <p className="noteMeta">
          {shelfLabel(note.shelf)} · {formatNoteUpdated(note.updated)}
        </p>
      </div>
    </form>
  );
}

export function NoteLibrary({ notes, onChanged }: NoteLibraryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (notes.length === 0) {
    return (
      <p className="emptyState">
        No notes yet. Write one preference, routine, or goal. It stays in this
        browser until you download the pack.
      </p>
    );
  }

  const knownShelves = DEFAULT_SHELVES.filter((shelf) =>
    notes.some((note) => note.shelf === shelf)
  );
  const additionalShelves = notes
    .map((note) => note.shelf)
    .filter(
      (shelf, index, shelves) =>
        !(DEFAULT_SHELVES as readonly string[]).includes(shelf) &&
        shelves.indexOf(shelf) === index
    );

  return (
    <div className="noteLibrary">
      {[...knownShelves, ...additionalShelves].map((shelf) => (
        <section className="shelf" key={shelf}>
          <h3>{shelfLabel(shelf)}</h3>
          {notes
            .filter((note) => note.shelf === shelf)
            .map((note) =>
              expandedId === note.id ? (
                <NoteEditor
                  key={note.id}
                  note={note}
                  onChanged={onChanged}
                  onCollapse={() => setExpandedId(null)}
                />
              ) : (
                <button
                  key={note.id}
                  type="button"
                  className="noteCard"
                  onClick={() => setExpandedId(note.id)}
                >
                  <span className="noteCardTitle">{note.title}</span>
                  <span className="noteCardExcerpt">{note.body}</span>
                  <span className="noteCardMeta">
                    {shelfLabel(note.shelf)} · {formatNoteUpdated(note.updated)}
                  </span>
                </button>
              )
            )}
        </section>
      ))}
    </div>
  );
}
