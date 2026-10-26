import { useEffect, useState } from "react";
import type { Note } from "@personal-os/pack-core";
import {
  byteSize,
  categoryLabel,
  formatBytes,
  formatNoteUpdated,
  shelfLabel,
  splitCaptureTag,
  wordCount,
} from "../display.js";
import { deleteNote } from "../store/notesStore.js";
import { browserLedgerBytes, type ShelfRecord } from "../store/shelvesStore.js";
import { CopyIcon, DownloadIcon, LockIcon, PlusIcon, TrashIcon } from "./Icons.js";
import { Modal } from "./Modal.js";

type LedgerFilter = "all" | "populated" | "empty" | "recent";

type LedgerGroup = {
  slug: string;
  name: string;
  description: string;
  color: string;
  order: number;
  notes: Note[];
};

type LedgerViewProps = {
  notes: Note[];
  shelves: ShelfRecord[];
  onOpenShelf: (slug: string) => void;
  onChanged: () => void;
  onDownload: () => void;
  onCreateShelf: () => void;
  exporting?: boolean;
};

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

function roman(value: number): string {
  if (value <= 0 || value > 39) return String(value);
  const glyphs = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ] as const;
  let rest = value;
  let text = "";
  for (const [amount, glyph] of glyphs) {
    while (rest >= amount) {
      text += glyph;
      rest -= amount;
    }
  }
  return text;
}

function notesFor(notes: Note[], slug: string): Note[] {
  return notes
    .filter((note) => note.shelf === slug)
    .sort((a, b) => b.updated.localeCompare(a.updated) || b.id.localeCompare(a.id));
}

function buildGroups(notes: Note[], shelves: ShelfRecord[]): LedgerGroup[] {
  const known = new Set(shelves.map((shelf) => shelf.slug));
  const orphans = notes
    .map((note) => note.shelf)
    .filter((slug, index, all) => !known.has(slug) && all.indexOf(slug) === index);
  return [
    ...shelves.map((shelf) => ({
      slug: shelf.slug,
      name: shelf.name,
      description: shelf.description,
      color: shelf.color,
      order: shelf.order,
      notes: notesFor(notes, shelf.slug),
    })),
    ...orphans.map((slug, index) => ({
      slug,
      name: shelfLabel(slug),
      description: "",
      color: "#6e7979",
      order: shelves.length + index + 1,
      notes: notesFor(notes, slug),
    })),
  ];
}

function isRecent(group: LedgerGroup, now = Date.now()): boolean {
  return group.notes.some((note) => {
    const time = new Date(note.updated).getTime();
    return !Number.isNaN(time) && time >= now - RECENT_MS;
  });
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/#/g, "");
}

function noteMatches(note: Note, query: string): boolean {
  return [note.title, note.body, ...note.tags].join("\n").toLowerCase().includes(query);
}

function matchingNotes(group: LedgerGroup, query: string): Note[] | null {
  if (!query) return group.notes;
  const matched = group.notes.filter((note) => noteMatches(note, query));
  if (matched.length > 0) return matched;
  const shelfText = `${group.name}\n${group.description}`.toLowerCase();
  return shelfText.includes(query) ? group.notes : null;
}

function passesFilter(group: LedgerGroup, filter: LedgerFilter, now = Date.now()): boolean {
  if (filter === "populated") return group.notes.length > 0;
  if (filter === "empty") return group.notes.length === 0;
  if (filter === "recent") return isRecent(group, now);
  return true;
}

function countLabel(count: number): string {
  if (count === 0) return "Empty";
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

function excerpt(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

export function LedgerView({
  notes,
  shelves,
  onOpenShelf,
  onChanged,
  onDownload,
  onCreateShelf,
  exporting = false,
}: LedgerViewProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [notice, setNotice] = useState("");
  const groups = buildGroups(notes, shelves);
  const normalized = normalizeQuery(query);
  const visible = groups.flatMap((group) => {
    if (!passesFilter(group, filter)) return [];
    const matched = matchingNotes(group, normalized);
    return matched ? [{ ...group, notes: matched }] : [];
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("ledger-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const entryWord = notes.length === 1 ? "entry" : "entries";
  const shelfWord = groups.length === 1 ? "shelf" : "shelves";
  const populated = groups.filter((group) => group.notes.length > 0).length;
  const empty = groups.length - populated;
  const recent = groups.filter((group) => isRecent(group)).length;

  async function copy(note: Note) {
    try {
      await navigator.clipboard.writeText(`${note.title}\n\n${note.body}`);
      setNotice("Copied.");
    } catch {
      setNotice("Could not copy this note.");
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteNote(pendingDelete.id);
    setPendingDelete(null);
    setNotice("");
    onChanged();
  }

  return (
    <section className="ledgerView" aria-labelledby="ledger-heading">
      <header className="ledgerHead">
        <div>
          <p className="ledgerKicker">
            <span>Index / Archival ledger</span>
            <span className="ledgerKickerDot" aria-hidden="true" />
            <span>Saved in this browser</span>
          </p>
          <h2 id="ledger-heading">Ledger</h2>
          <p className="ledgerSummary">
            {notes.length} {entryWord} cataloged across {groups.length} distinct {shelfWord} ·
            Saved in this browser
          </p>
        </div>
        <dl className="ledgerStats">
          <div>
            <dt>Entries</dt>
            <dd>
              {notes.length} {notes.length === 1 ? "note" : "notes"}
            </dd>
          </div>
          <div>
            <dt>Footprint</dt>
            <dd>{formatBytes(browserLedgerBytes())}</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>This browser</dd>
          </div>
        </dl>
      </header>

      {notice ? (
        <p className="banner" role="status">
          {notice}
        </p>
      ) : null}

      <div className="ledgerTools">
        <div className="ledgerSearch">
          <label className="srOnly" htmlFor="ledger-search">
            Search ledger
          </label>
          <input
            id="ledger-search"
            type="search"
            value={query}
            placeholder="Search entries across shelves or tags"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>⌘K</kbd>
        </div>
        <div className="ledgerFilters" role="group" aria-label="Shelf filters">
          {(
            [
              ["all", `All shelves (${groups.length})`],
              ["populated", `Populated (${populated})`],
              ["empty", `Empty (${empty})`],
              ["recent", `Recent edits (${recent})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "isActive" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="emptyState">No shelves match this view.</p>
      ) : (
        <div className="ledgerGrid">
          {visible.map((group) => (
            <article key={group.slug} className="ledgerShelf">
              <div className="ledgerShelfTop">
                <div className="ledgerShelfTitle">
                  <span className="ledgerSwatch" style={{ background: group.color }} aria-hidden="true" />
                  <h3>{group.name}</h3>
                  <span className={group.notes.length === 0 ? "ledgerCount isEmpty" : "ledgerCount"}>
                    {countLabel(group.notes.length)}
                  </span>
                </div>
                <div className="ledgerShelfActions">
                  {group.notes.length > 0 ? (
                    <button
                      type="button"
                      className="ledgerIconAction"
                      aria-label={`Add note to ${group.name}`}
                      onClick={() => onOpenShelf(group.slug)}
                    >
                      <PlusIcon />
                    </button>
                  ) : null}
                  <button type="button" className="ledgerOpen" onClick={() => onOpenShelf(group.slug)}>
                    {group.notes.length > 0 ? "Open shelf" : "+ Add note"}
                    {group.notes.length > 0 ? <span aria-hidden="true">→</span> : null}
                  </button>
                </div>
              </div>

              {group.notes.length === 0 ? (
                <div className="ledgerEmpty">
                  <p>No notes yet</p>
                  {group.description ? <p>{group.description}</p> : null}
                  <button type="button" className="buttonSecondary" onClick={() => onOpenShelf(group.slug)}>
                    Add note
                  </button>
                </div>
              ) : (
                <ul className="ledgerNotes">
                  {group.notes.map((note) => {
                    const tags = splitCaptureTag(note.tags).tags;
                    return (
                      <li key={note.id} className="ledgerNote">
                        <div className="ledgerNoteTop">
                          <div>
                            <p className="ledgerNoteTags">
                              <span className="ledgerChip">{categoryLabel(note.tags, group.name)}</span>
                              {tags.map((tag) => (
                                <span key={tag}>#{tag}</span>
                              ))}
                            </p>
                            <h4>
                              <button type="button" onClick={() => onOpenShelf(group.slug)}>
                                {note.title}
                              </button>
                            </h4>
                            <p className="ledgerExcerpt">{excerpt(note.body)}</p>
                          </div>
                          <div className="ledgerNoteActions">
                            <button
                              type="button"
                              aria-label={`Copy ${note.title}`}
                              onClick={() => void copy(note)}
                            >
                              <CopyIcon />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${note.title}`}
                              onClick={() => setPendingDelete(note)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                        <p className="ledgerNoteMeta">
                          <span>{formatNoteUpdated(note.updated)}</span>
                          <span>
                            {wordCount(note.body)} {wordCount(note.body) === 1 ? "word" : "words"} ·{" "}
                            {byteSize(note.body)} bytes
                          </span>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="ledgerRef">
                Shelf {roman(group.order)}
                {group.notes.length === 0 ? " / Empty" : ""}
              </p>
            </article>
          ))}
        </div>
      )}

      <section className="ledgerFoot">
        <div>
          <span className="ledgerLock" aria-hidden="true">
            <LockIcon />
          </span>
          <div>
            <h3>Saved in this browser</h3>
            <p>Notes stay on this device. Nothing here is uploaded.</p>
          </div>
        </div>
        <div className="ledgerFootActions">
          <button type="button" className="buttonSecondary" onClick={onDownload} disabled={exporting}>
            <DownloadIcon />
            <span>{exporting ? "Exporting…" : "Download pack"}</span>
          </button>
          <button type="button" className="buttonPrimary" onClick={onCreateShelf}>
            <PlusIcon />
            <span>New shelf</span>
          </button>
        </div>
      </section>

      {pendingDelete ? (
        <Modal title="Delete this note?" onClose={() => setPendingDelete(null)}>
          <p className="modalCopy">
            This removes it permanently from this browser ledger and cannot be undone without a
            backup pack.
          </p>
          <div className="modalActions">
            <button type="button" className="buttonSecondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button type="button" className="buttonDanger" onClick={confirmDelete}>
              Delete Note
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
