import { useState } from "react";
import { CaptureForm } from "./components/CaptureForm.js";
import { NoteLibrary } from "./components/NoteLibrary.js";
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
    <main className="app">
      <header className="appHeader">
        <h1>Personal OS — Capture</h1>
        <div className="appHeaderActions">
          <button type="button" onClick={handleDownload} disabled={exporting}>
            {exporting ? "Exporting…" : "Download pack"}
          </button>
          {exportError ? (
            <p className="exportError" role="alert">
              {exportError}
            </p>
          ) : null}
        </div>
      </header>
      <section className="panel" aria-labelledby="capture-heading">
        <h2 id="capture-heading">Capture</h2>
        <CaptureForm onSaved={reloadNotes} />
      </section>
      <section className="panel" aria-labelledby="library-heading">
        <h2 id="library-heading">Library</h2>
        <NoteLibrary notes={notes} onChanged={reloadNotes} />
      </section>
    </main>
  );
}
