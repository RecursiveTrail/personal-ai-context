import { useEffect, useRef, useState, type FormEvent } from "react";
import { DownloadIcon, MoreIcon } from "./components/Icons.js";
import { Modal } from "./components/Modal.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { AudioCapture } from "./components/AudioCapture.js";
import { LedgerView } from "./components/LedgerView.js";
import { ColorSwatches, ShelfDetail } from "./components/ShelfDetail.js";
import { ShelvesHub } from "./components/ShelvesHub.js";
import { formatBytes } from "./display.js";
import { readCaptureFile } from "./lib/ingestFile.js";
import { buildPackZip, downloadPackZip } from "./lib/exportZip.js";
import { setPendingDraft } from "./pendingDraft.js";
import { parseRoute, shelfHash, type DeskRoute } from "./route.js";
import { loadNotes } from "./store/notesStore.js";
import {
  browserLedgerBytes,
  clearLedger,
  createShelf,
  loadShelves,
  SHELF_COLORS,
} from "./store/shelvesStore.js";

export default function App() {
  const [notes, setNotes] = useState(loadNotes);
  const [shelves, setShelves] = useState(loadShelves);
  const [route, setRoute] = useState<DeskRoute>(() => parseRoute(window.location.hash));
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function reload() {
    setNotes(loadNotes());
    setShelves(loadShelves());
  }

  function go(hash: string) {
    if (window.location.hash !== hash) window.location.hash = hash;
    setRoute(parseRoute(hash));
  }

  useEffect(() => {
    function onHash() {
      setRoute(parseRoute(window.location.hash));
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  async function handleDownload() {
    setExporting(true);
    setBanner(null);
    try {
      const blob = await buildPackZip(loadNotes());
      downloadPackZip(blob);
      setMenuOpen(false);
    } catch {
      setBanner("Download failed. Try again.");
    } finally {
      setExporting(false);
    }
  }

  async function uploadToPreferences(file: File) {
    const result = await readCaptureFile(file);
    if (result.ok) {
      setPendingDraft({ text: result.text, source: result.source });
    } else {
      setPendingDraft({
        text: "",
        source: "text",
        message: result.message,
        messageIsError: true,
      });
    }
    go(shelfHash("preferences"));
  }

  async function pasteToPreferences() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setBanner("Clipboard is empty.");
        return;
      }
      setPendingDraft({ text, source: "clipboard" });
      setBanner(null);
    } catch {
      setPendingDraft({
        text: "",
        source: "clipboard",
        message: "Clipboard access was denied. Paste into the field instead.",
        messageIsError: true,
      });
    }
    go(shelfHash("preferences"));
  }

  const activeShelf =
    route.view === "shelf"
      ? shelves.find((shelf) => shelf.slug === route.slug)
      : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbarInner">
          <div className="brand">
            <h1>Personal OS</h1>
            <p>Saved in this browser</p>
          </div>
          <nav className="deskNav" aria-label="Desk">
            {(
              [
                ["hub", "#/", "Desk"],
                ["ledger", "#/ledger", "Ledger"],
                ["audio", "#/audio", "Audio Capture"],
              ] as const
            ).map(([view, hash, label]) => (
              <button
                key={view}
                type="button"
                className={route.view === view ? "isActive" : ""}
                aria-current={route.view === view ? "page" : undefined}
                onClick={() => go(hash)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="topbarTools" ref={menuRef}>
            <button
              type="button"
              className="iconButton"
              aria-label="Desk menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreIcon />
            </button>
            {menuOpen ? (
              <div className="menu menuAlignEnd" role="menu">
                <button type="button" role="menuitem" onClick={() => void handleDownload()} disabled={exporting}>
                  <DownloadIcon />
                  <span>
                    <strong>{exporting ? "Exporting…" : "Download pack"}</strong>
                    <small>Downloads personal-os.zip</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                >
                  <span>
                    <strong>LLM settings</strong>
                    <small>Key stays in this browser</small>
                  </span>
                </button>
                <p className="menuMeter">Storage: {formatBytes(browserLedgerBytes())} used</p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setClearOpen(true);
                  }}
                >
                  <span>
                    <strong>Clear browser cache</strong>
                    <small>Notes and custom shelves</small>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="desk">
        {banner ? (
          <p className="banner bannerError" role="alert">
            {banner}
          </p>
        ) : null}
        {route.view === "hub" ? (
          <ShelvesHub
            shelves={shelves}
            notes={notes}
            onOpen={(slug) => go(shelfHash(slug))}
            onCreate={() => setCreateOpen(true)}
            onRecord={() => go("#/audio")}
            onUpload={(file) => void uploadToPreferences(file)}
            onPaste={() => void pasteToPreferences()}
          />
        ) : route.view === "ledger" ? (
          <LedgerView
            notes={notes}
            shelves={shelves}
            onOpenShelf={(slug) => go(shelfHash(slug))}
          />
        ) : route.view === "audio" ? (
          <AudioCapture shelves={shelves} onSaved={reload} onStorageError={setBanner} />
        ) : activeShelf ? (
          <ShelfDetail
            shelf={activeShelf}
            notes={notes.filter((note) => note.shelf === activeShelf.slug)}
            shelves={shelves}
            onBack={() => go("#/")}
            onChanged={reload}
            onStorageError={setBanner}
            onDeleted={() => {
              reload();
              go("#/");
            }}
          />
        ) : (
          <div className="missingShelf">
            <p>This shelf is not in this browser.</p>
            <button type="button" className="buttonSecondary" onClick={() => go("#/")}>
              All shelves
            </button>
          </div>
        )}
      </main>

      <footer className="deskFooter">
        <p>100% private · Saved in this browser · No telemetry</p>
        <p>Personal OS v1.0 · Local Desk</p>
      </footer>

      {settingsOpen ? (
        <Modal title="LLM settings" onClose={() => setSettingsOpen(false)}>
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        </Modal>
      ) : null}
      {createOpen ? (
        <NewShelfDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(slug) => {
            reload();
            setCreateOpen(false);
            go(shelfHash(slug));
          }}
        />
      ) : null}
      {clearOpen ? (
        <Modal title="Clear this browser ledger?" onClose={() => setClearOpen(false)}>
          <p className="modalCopy">
            This deletes notes and custom shelves stored in this browser. LLM
            settings stay. Download a pack first if you want a backup.
          </p>
          <div className="modalActions">
            <button type="button" className="buttonSecondary" onClick={() => setClearOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="buttonDanger"
              onClick={() => {
                clearLedger();
                reload();
                setClearOpen(false);
                setBanner(null);
                go("#/");
              }}
            >
              Clear ledger
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function NewShelfDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(SHELF_COLORS[0]);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const shelf = createShelf({ name, description, color });
      onCreated(shelf.slug);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create shelf.");
    }
  }

  return (
    <Modal title="New shelf" onClose={onClose}>
      <form className="stackForm" onSubmit={submit}>
        {error ? (
          <p className="banner bannerError" role="alert">
            {error}
          </p>
        ) : null}
        <label className="fieldLabel" htmlFor="shelf-name">
          Shelf name
        </label>
        <input
          id="shelf-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <label className="fieldLabel" htmlFor="shelf-description">
          Description
        </label>
        <textarea
          id="shelf-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <ColorSwatches name="shelf-color" value={color} onChange={setColor} />
        <div className="modalActions">
          <button type="button" className="buttonSecondary" onClick={onClose}>
            Discard
          </button>
          <button type="submit" className="buttonPrimary">
            Create shelf
          </button>
        </div>
      </form>
    </Modal>
  );
}
