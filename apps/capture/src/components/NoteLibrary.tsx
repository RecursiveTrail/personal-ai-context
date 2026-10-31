import { useState, type FormEvent } from "react";
import type { Note } from "@personal-os/pack-core";
import {
  byteSize,
  categoryLabel,
  directiveLabel,
  formatNoteCreated,
  formatNoteUpdated,
  shelfLabel,
  SOURCE_LABEL,
  splitCaptureTag,
  wordCount,
} from "../display.js";
import { deleteNote, updateNote } from "../store/notesStore.js";
import { deleteNoteOnCompanion } from "../lib/companionClient.js";
import type { ShelfRecord } from "../store/shelvesStore.js";
import { AttachIcon, MicIcon, TrashIcon } from "./Icons.js";
import { Modal } from "./Modal.js";

type NoteLibraryProps = {
  notes: Note[];
  shelves: ShelfRecord[];
  onChanged: () => void;
};

type NoteEditorProps = {
  note: Note;
  onChanged: () => void;
  onCollapse: () => void;
};

function NoteEditor({ note, onChanged, onCollapse }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [message, setMessage] = useState("");

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      updateNote(note.id, { title, body });
      setMessage("");
      onChanged();
      onCollapse();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update note.");
    }
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
        <label className="fieldLabel" htmlFor={`edit-body-${note.id}`}>
          Note
        </label>
        <textarea
          id={`edit-body-${note.id}`}
          aria-label={`Body for ${title}`}
          rows={4}
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
        <button type="submit" className="buttonPrimary">
          Save changes
        </button>
        <button type="button" className="buttonSecondary" onClick={onCollapse}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NoteLibrary({ notes, shelves, onChanged }: NoteLibraryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [notice, setNotice] = useState("");

  const ordered = [...notes].sort(
    (a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id)
  );

  if (ordered.length === 0) {
    return <p className="emptyState">No notes on this shelf yet.</p>;
  }

  async function copy(note: Note) {
    try {
      await navigator.clipboard.writeText(`${note.title}\n\n${note.body}`);
      setNotice("Copied.");
    } catch {
      setNotice("Could not copy this note.");
    }
  }

  function move(note: Note, shelf: string) {
    updateNote(note.id, { shelf });
    setMovingId(null);
    onChanged();
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteNote(pendingDelete.id);
    void deleteNoteOnCompanion(pendingDelete.id);
    if (expandedId === pendingDelete.id) setExpandedId(null);
    setPendingDelete(null);
    onChanged();
  }

  return (
    <div className="noteLibrary">
      {notice ? (
        <p className="banner" role="status">
          {notice}
        </p>
      ) : null}
      {ordered.map((note, index) => {
        const { source } = splitCaptureTag(note.tags);
        const shelfName =
          shelves.find((shelf) => shelf.slug === note.shelf)?.name ??
          shelfLabel(note.shelf);
        return (
          <article className="noteCard" key={note.id}>
            <div className="noteCardTop">
              <div className="noteKicker">
                <span className="kickerIcon" aria-hidden="true">
                  {source === "pdf" ? <AttachIcon /> : <MicIcon />}
                </span>
                <span className="directive">{directiveLabel(index + 1)}</span>
                <span className="category">
                  {categoryLabel(note.tags, shelfName)}
                </span>
              </div>
              <div className="noteActions">
                <button type="button" onClick={() => setExpandedId(note.id)}>
                  Edit
                </button>
                <button type="button" onClick={() => void copy(note)}>
                  Copy note
                </button>
                <button
                  type="button"
                  aria-expanded={movingId === note.id}
                  onClick={() =>
                    setMovingId((current) => (current === note.id ? null : note.id))
                  }
                >
                  Move shelf
                </button>
                <button
                  type="button"
                  className="iconButton"
                  aria-label={`Delete ${note.title}`}
                  onClick={() => setPendingDelete(note)}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
            {movingId === note.id ? (
              <div className="moveMenu" role="menu" aria-label={`Move ${note.title}`}>
                {shelves.map((shelf) => (
                  <button
                    key={shelf.slug}
                    type="button"
                    role="menuitem"
                    disabled={shelf.slug === note.shelf}
                    onClick={() => move(note, shelf.slug)}
                  >
                    {shelf.name}
                  </button>
                ))}
              </div>
            ) : null}
            {expandedId === note.id ? (
              <NoteEditor
                note={note}
                onChanged={onChanged}
                onCollapse={() => setExpandedId(null)}
              />
            ) : (
              <>
                <h3>{note.title}</h3>
                <blockquote>{note.body}</blockquote>
                <footer className="noteMeta">
                  <span>
                    {formatNoteCreated(note.created)}
                    <span aria-hidden="true"> · </span>
                    {formatNoteUpdated(note.updated)}
                    <span className="chip">{SOURCE_LABEL[source]}</span>
                  </span>
                  <span>
                    {wordCount(note.body)} words · {byteSize(note.body)} bytes
                  </span>
                </footer>
              </>
            )}
          </article>
        );
      })}
      {pendingDelete ? (
        <Modal title="Delete this note?" onClose={() => setPendingDelete(null)}>
          <p className="modalCopy">
            This removes it permanently from this browser ledger and cannot be
            undone without a backup pack.
          </p>
          <div className="modalActions">
            <button
              type="button"
              className="buttonSecondary"
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </button>
            <button type="button" className="buttonDanger" onClick={confirmDelete}>
              Delete Note
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
