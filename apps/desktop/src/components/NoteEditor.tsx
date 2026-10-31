import { useState } from "react";
import type { Note, NoteInput } from "../lib/tauriApi";

type Props = {
  /** `null` means a new, unsaved note. */
  note: Note | null;
  shelves: string[];
  defaultShelf: string;
  busy: boolean;
  onSave: (input: NoteInput) => void;
  onDelete: (note: Note) => void;
};

const parseTags = (raw: string) =>
  raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/** Remount with a `key` when switching notes so the draft resets. */
export function NoteEditor({ note, shelves, defaultShelf, busy, onSave, onDelete }: Props) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [shelf, setShelf] = useState(note?.shelf ?? defaultShelf);
  const [tags, setTags] = useState((note?.tags ?? []).join(", "));
  const [body, setBody] = useState(note?.body ?? "");

  const canSave = !busy && title.trim() !== "" && shelf.trim() !== "";

  return (
    <form
      className="editor"
      aria-label="Note editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        onSave({
          id: note?.id,
          title: title.trim(),
          shelf: shelf.trim(),
          body,
          tags: parseTags(tags),
        });
      }}
    >
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Shelf
        <input list="shelf-options" value={shelf} onChange={(e) => setShelf(e.target.value)} />
        <datalist id="shelf-options">
          {shelves.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label>
        Tags (comma separated)
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label className="grow">
        Body
        <textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="actions">
        <button type="submit" disabled={!canSave}>
          Save
        </button>
        {note ? (
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete "${note.title}"?`)) onDelete(note);
            }}
          >
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}
