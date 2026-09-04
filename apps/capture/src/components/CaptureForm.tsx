import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  createSpeechController,
  SPEECH_UNSUPPORTED_MESSAGE,
} from "../lib/speech.js";
import { DEFAULT_SHELVES, saveNote } from "../store/notesStore.js";

type CaptureFormProps = {
  onSaved: () => void;
};

export function CaptureForm({ onSaved }: CaptureFormProps) {
  const speech = useMemo(() => createSpeechController(), []);
  const speechPrefix = useRef("");
  const [title, setTitle] = useState("");
  const [shelf, setShelf] = useState<string>(DEFAULT_SHELVES[0]);
  const [body, setBody] = useState("");
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState(
    speech.supported ? "" : SPEECH_UNSUPPORTED_MESSAGE
  );

  useEffect(() => () => speech.stop(), [speech]);

  function startRecording() {
    speechPrefix.current = body.trimEnd();
    setMessage("");
    speech.start(
      (text) => {
        const separator = speechPrefix.current && text ? "\n" : "";
        setBody(`${speechPrefix.current}${separator}${text}`);
      },
      (error) => {
        setRecording(false);
        setMessage(error);
      }
    );
    if (speech.supported) setRecording(true);
  }

  function stopRecording() {
    speech.stop();
    setRecording(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      saveNote({ title, shelf, body });
      stopRecording();
      setTitle("");
      setBody("");
      setMessage("Note saved.");
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save note.");
    }
  }

  return (
    <form className="captureForm" onSubmit={submit}>
      {message && (
        <p className="banner" role="status">
          {message}
        </p>
      )}

      <label htmlFor="capture-title">Title</label>
      <input
        id="capture-title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
      />

      <label htmlFor="capture-shelf">Shelf</label>
      <select
        id="capture-shelf"
        value={shelf}
        onChange={(event) => setShelf(event.target.value)}
      >
        {DEFAULT_SHELVES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <label htmlFor="capture-body">Note</label>
      <textarea
        id="capture-body"
        rows={8}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        required
      />

      <div className="actions">
        <button
          type="button"
          onClick={startRecording}
          disabled={recording}
        >
          Record
        </button>
        <button type="button" onClick={stopRecording} disabled={!recording}>
          Stop
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
