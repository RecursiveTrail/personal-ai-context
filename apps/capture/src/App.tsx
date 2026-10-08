import { useState } from "react";
import { CaptureForm } from "./components/CaptureForm.js";
import { DownloadIcon } from "./components/Icons.js";
import { NoteLibrary } from "./components/NoteLibrary.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { buildPackZip, downloadPackZip } from "./lib/exportZip.js";
import { loadNotes } from "./store/notesStore.js";

export default function App() {
  const [notes, setNotes] = useState(loadNotes);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const reloadNotes = () => setNotes(loadNotes());

  const handleDownload = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await buildPackZip(loadNotes());
      downloadPackZip(blob);
    } catch {
      setExportError("Download failed. Try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <header className="appHeader">
        <div className="appHeaderInner">
          <div className="brand">
            <h1>Personal OS</h1>
            <p className="brandTagline">Saved in this browser</p>
          </div>
          <div className="appHeaderActions">
            <button
              type="button"
              className="buttonSecondary"
              onClick={handleDownload}
              disabled={exporting}
            >
              <DownloadIcon />
              <span>{exporting ? "Exporting…" : "Download pack"}</span>
            </button>
            {exportError ? (
              <p className="exportError" role="alert">
                {exportError}
              </p>
            ) : (
              <p className="downloadHint">Downloads personal-os.zip</p>
            )}
          </div>
        </div>
      </header>
      <main className="workspace">
        <SettingsPanel />
        <section className="captureCard" aria-labelledby="capture-heading">
          <h2 id="capture-heading">New note</h2>
          <CaptureForm onSaved={reloadNotes} />
        </section>
        <section className="libraryColumn" aria-labelledby="library-heading">
          <h2 id="library-heading">Library</h2>
          <NoteLibrary notes={notes} onChanged={reloadNotes} />
        </section>
      </main>
    </div>
  );
}
