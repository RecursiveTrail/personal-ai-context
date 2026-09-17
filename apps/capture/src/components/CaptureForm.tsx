import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { processCapturedText } from "../lib/llm/client.js";
import {
  createSpeechController,
  SPEECH_UNSUPPORTED_MESSAGE,
} from "../lib/speech.js";
import { DEFAULT_SHELVES, saveNote } from "../store/notesStore.js";
import { isLlmConfigured } from "../store/settingsStore.js";

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
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(
    speech.supported ? "" : SPEECH_UNSUPPORTED_MESSAGE
  );
  const [messageIsError, setMessageIsError] = useState(false);
  const llmConfigured = isLlmConfigured();

  useEffect(() => () => speech.stop(), [speech]);

  function startRecording() {
    speechPrefix.current = body.trimEnd();
    setMessage("");
    setMessageIsError(false);
    speech.start(
      (text) => {
        const separator = speechPrefix.current && text ? "\n" : "";
        setBody(`${speechPrefix.current}${separator}${text}`);
      },
      (error) => {
        setRecording(false);
        setMessage(error);
        setMessageIsError(true);
      }
    );
    if (speech.supported) setRecording(true);
  }

  function stopRecording() {
    speech.stop();
    setRecording(false);
  }

  async function handleProcessText() {
    if (!body.trim()) {
      setMessage("Add note text before processing.");
      setMessageIsError(true);
      return;
    }
    if (!llmConfigured) {
      setMessage("Add an API key in LLM settings first.");
      setMessageIsError(true);
      return;
    }

    setProcessing(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const processed = await processCapturedText(body);
      setBody(processed);
      setMessage("Note processed. Review the text before saving.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not process note text."
      );
      setMessageIsError(true);
    } finally {
      setProcessing(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      saveNote({ title, shelf, body });
      stopRecording();
      setTitle("");
      setBody("");
      setMessage("Note saved.");
      setMessageIsError(false);
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save note.");
      setMessageIsError(true);
    }
  }

  return (
    <form className="captureForm" onSubmit={submit}>
      {message && (
        <p
          className={messageIsError ? "banner bannerError" : "banner"}
          role="status"
        >
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
          disabled={recording || processing}
        >
          Record
        </button>
        <button
          type="button"
          onClick={stopRecording}
          disabled={!recording || processing}
        >
          Stop
        </button>
        <button
          type="button"
          onClick={handleProcessText}
          disabled={recording || processing || !body.trim()}
        >
          {processing ? "Processing…" : "Process with LLM"}
        </button>
        <button type="submit" disabled={processing}>
          Save
        </button>
      </div>
    </form>
  );
}
