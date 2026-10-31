import { useCallback, useEffect, useState } from "react";
import { NoteEditor } from "./components/NoteEditor";
import { NoteList } from "./components/NoteList";
import { PendingPanel } from "./components/PendingPanel";
import { ShelfList } from "./components/ShelfList";
import * as api from "./lib/tauriApi";
import type { Note, NoteInput } from "./lib/tauriApi";

const NEW = "__new__";

export function App() {
  const [shelves, setShelves] = useState<string[]>([]);
  const [shelf, setShelf] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, n] = await Promise.all([api.listShelves(), api.listNotes(shelf)]);
      setShelves(s);
      setNotes(n);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [shelf]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = async (id: string) => {
    setSelectedId(id);
    try {
      const loaded = await api.getNote(id);
      setSelected(loaded);
      if (!loaded) setError(`Note not found: ${id}`);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const save = async (input: NoteInput) => {
    setBusy(true);
    try {
      const saved = await api.upsertNote(input);
      setSelectedId(saved.id);
      setSelected(saved);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note: Note) => {
    setBusy(true);
    try {
      await api.deleteNote(note.id);
      setSelectedId(null);
      setSelected(null);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const editing = selectedId === NEW || selected !== null;

  return (
    <div className="app-shell">
      <header className="brand">
        <h1>Chit</h1>
        <p className="tagline">
          The local consciousness layer and MCP runtime for personal AI agents.
        </p>
      </header>
      <div className="desk">
        <ShelfList shelves={shelves} selected={shelf} onSelect={setShelf} />
        <NoteList
          notes={notes}
          selectedId={selectedId === NEW ? null : selectedId}
          onSelect={(id) => void select(id)}
          onNew={() => {
            setSelectedId(NEW);
            setSelected(null);
          }}
        />
        <main className="detail">
          {error ? (
            <p role="alert" className="error">
              {error}
            </p>
          ) : null}
          {editing ? (
            <NoteEditor
              key={selected?.id ?? NEW}
              note={selected}
              shelves={shelves}
              defaultShelf={shelf ?? ""}
              busy={busy}
              onSave={(input) => void save(input)}
              onDelete={(note) => void remove(note)}
            />
          ) : (
            <p className="muted">Select a note or create a new one.</p>
          )}
          <aside id="pending-slot" aria-label="Pending changes">
            <PendingPanel onResolved={() => void reload()} />
          </aside>
        </main>
      </div>
    </div>
  );
}
