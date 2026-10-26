import { useRef, useState, type DragEvent, type FormEvent } from "react";
import type { Note } from "@personal-os/pack-core";
import { formatBytes, shelfStatusLine } from "../display.js";
import {
  browserLedgerBytes,
  deleteShelf,
  SHELF_COLORS,
  shelfKind,
  updateShelf,
  type ShelfRecord,
} from "../store/shelvesStore.js";
import { BackIcon, BracketsIcon, PlusIcon, TrayIcon } from "./Icons.js";
import { Modal } from "./Modal.js";
import { CaptureForm, type CaptureFormHandle } from "./CaptureForm.js";
import { NoteLibrary } from "./NoteLibrary.js";

type ShelfDetailProps = {
  shelf: ShelfRecord;
  notes: Note[];
  shelves: ShelfRecord[];
  onBack: () => void;
  onChanged: () => void;
  onStorageError: (message: string) => void;
  onDeleted: () => void;
};

export function ShelfDetail({
  shelf,
  notes,
  shelves,
  onBack,
  onChanged,
  onStorageError,
  onDeleted,
}: ShelfDetailProps) {
  const captureRef = useRef<CaptureFormHandle>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragging, setDragging] = useState(false);
  const noteCount = notes.length;

  function focusCapture() {
    captureRef.current?.focus();
  }

  async function takeFiles(files: File[]) {
    await captureRef.current?.appendFiles(files);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files];
    if (files.length > 0) {
      void takeFiles(files);
      return;
    }
    const text = event.dataTransfer.getData("text/plain");
    if (text.trim()) captureRef.current?.appendText(text, "clipboard");
  }

  return (
    <div className="shelfDetail">
      <div className="shelfHead">
        <button type="button" className="backLink" onClick={onBack}>
          <BackIcon />
          <span>All Shelves</span>
        </button>
        <p className="statusPill">
          <span className="statusDot" aria-hidden="true" />
          {shelfStatusLine(notes)}
        </p>
        <p className="eyebrow shelfEyebrow">
          Shelf {String(shelf.order).padStart(2, "0")} / {shelfKind(shelf.slug)}
        </p>
        <div className="shelfTitleRow">
          <h2>{shelf.name}</h2>
          <div className="shelfActions">
            <div className="menuWrap">
              <button
                type="button"
                className="buttonSecondary"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                Shelf options
              </button>
              {menuOpen ? (
                <div className="menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setEditing(true);
                    }}
                  >
                    Edit details
                  </button>
                  {shelf.isDefault ? null : (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={noteCount > 0}
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmDelete(true);
                      }}
                    >
                      Delete shelf
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <button type="button" className="buttonPrimary" onClick={focusCapture}>
              <PlusIcon />
              <span>Add note to shelf</span>
            </button>
          </div>
        </div>
        <p className="shelfDescription">{shelf.description}</p>
      </div>

      <CaptureForm
        ref={captureRef}
        shelf={shelf.slug}
        shelfName={shelf.name}
        onSaved={onChanged}
        onStorageError={onStorageError}
      />
      <NoteLibrary notes={notes} shelves={shelves} onChanged={onChanged} />

      <div
        className={dragging ? "dropZone isDragging" : "dropZone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text/plain");
          if (!text.trim()) return;
          event.preventDefault();
          captureRef.current?.appendText(text, "clipboard");
        }}
      >
        <span className="dropIcon" aria-hidden="true">
          <TrayIcon />
        </span>
        <p>Drop a PDF or text file, or paste text, to append to {shelf.name}.</p>
        <p className="dropHint">
          Supports .pdf and plain text. Dictation stays in this browser.
        </p>
      </div>

      <section className="statusCards" aria-label="Shelf status">
        <article>
          <span className="statusIcon" aria-hidden="true">
            <TrayIcon />
          </span>
          <p>Ledger Index</p>
          <strong>Shelf #{String(shelf.order).padStart(2, "0")}</strong>
        </article>
        <article>
          <span className="statusIcon" aria-hidden="true">
            <BracketsIcon />
          </span>
          <p>Prompt Injection</p>
          <strong>System Level</strong>
        </article>
        <article>
          <span className="statusIcon" aria-hidden="true">
            <TrayIcon />
          </span>
          <p>Storage State</p>
          <strong>{formatBytes(browserLedgerBytes())}</strong>
          <span>Local storage</span>
        </article>
      </section>

      {editing ? (
        <EditShelfDialog
          shelf={shelf}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      ) : null}
      {confirmDelete ? (
        <Modal title="Delete this shelf?" onClose={() => setConfirmDelete(false)}>
          <p className="modalCopy">
            {noteCount > 0
              ? "Move every note off this shelf before deleting it."
              : `This removes ${shelf.name} from this browser. Notes already exported stay in your pack.`}
          </p>
          <div className="modalActions">
            <button
              type="button"
              className="buttonSecondary"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="buttonDanger"
              disabled={noteCount > 0}
              onClick={() => {
                deleteShelf(shelf.slug);
                setConfirmDelete(false);
                onDeleted();
              }}
            >
              Delete shelf
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function EditShelfDialog({
  shelf,
  onClose,
  onSaved,
}: {
  shelf: ShelfRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(shelf.name);
  const [description, setDescription] = useState(shelf.description);
  const [color, setColor] = useState(shelf.color);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      updateShelf(shelf.slug, { name, description, color });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update shelf.");
    }
  }

  return (
    <Modal title="Edit shelf" onClose={onClose}>
      <form className="stackForm" onSubmit={submit}>
        {error ? (
          <p className="banner bannerError" role="alert">
            {error}
          </p>
        ) : null}
        <label className="fieldLabel" htmlFor="edit-shelf-name">
          Shelf name
        </label>
        <input
          id="edit-shelf-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={shelf.isDefault}
          required
        />
        <label className="fieldLabel" htmlFor="edit-shelf-description">
          Description
        </label>
        <textarea
          id="edit-shelf-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <ColorSwatches name="edit-shelf-color" value={color} onChange={setColor} />
        <div className="modalActions">
          <button type="button" className="buttonSecondary" onClick={onClose}>
            Discard
          </button>
          <button type="submit" className="buttonPrimary">
            Save shelf
          </button>
        </div>
      </form>
    </Modal>
  );
}

const SWATCH_LABELS: Record<string, string> = {
  "#0f6e6e": "Teal",
  "#246868": "Sea",
  "#3e4948": "Slate",
  "#8f2d2d": "Brick",
  "#1e1b19": "Ink",
  "#6e7979": "Stone",
};

export function ColorSwatches({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Color accent">
      {SHELF_COLORS.map((color) => (
        <label key={color} className={color === value ? "swatch isSelected" : "swatch"}>
          <input
            type="radio"
            name={name}
            value={color}
            aria-label={SWATCH_LABELS[color] ?? "Color"}
            checked={color === value}
            onChange={() => onChange(color)}
          />
          <span style={{ background: color }} />
        </label>
      ))}
    </div>
  );
}
