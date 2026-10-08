import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { processCapturedText } from "../lib/llm/client.js";
import {
  createSpeechController,
  SPEECH_UNSUPPORTED_MESSAGE,
} from "../lib/speech.js";
import { DEFAULT_SHELVES, saveNote } from "../store/notesStore.js";
import { isLlmConfigured } from "../store/settingsStore.js";
import { MicIcon } from "./Icons.js";
import { ShelfPicker } from "./ShelfPicker.js";

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

  function clearSavedNotice() {
    setMessage((current) => (current === "Note saved." ? "" : current));
  }

  const saved = message === "Note saved.";
  const status = recording ? "Listening…" : saved ? "Note saved." : "";
  const bannerMessage = saved ? "" : message;

  return (
    <form className="captureForm" onSubmit={submit}>
      {bannerMessage ? (
        <p
          className={messageIsError ? "banner bannerError" : "banner"}
          role="status"
        >
          {bannerMessage}
        </p>
      ) : null}

      <div className="field">
        <label className="fieldLabel" htmlFor="capture-title">
          Title
        </label>
        <input
          id="capture-title"
          value={title}
          placeholder="Prefer short answers"
          onChange={(event) => {
            setTitle(event.target.value);
            clearSavedNotice();
          }}
          required
        />
      </div>

      <div className="field">
        <span className="fieldLabel" id="capture-shelf-label">
          Shelf
        </span>
        <ShelfPicker
          name="capture-shelf"
          value={shelf}
          onChange={(next) => {
            setShelf(next);
            clearSavedNotice();
          }}
          labelId="capture-shelf-label"
        />
      </div>

      <div className="field">
        <label className="fieldLabel" htmlFor="capture-body">
          Note
        </label>
        <textarea
          id="capture-body"
          rows={8}
          value={body}
          placeholder="One idea. Plain sentences an assistant can quote."
          onChange={(event) => {
            setBody(event.target.value);
            clearSavedNotice();
          }}
          required
        />
      </div>

      <div className="actions">
        <button
          type="button"
          className={recording ? "buttonQuiet isRecording" : "buttonQuiet"}
          onClick={recording ? stopRecording : startRecording}
          disabled={processing || (!recording && !speech.supported)}
        >
          <MicIcon />
          <span>{recording ? "Stop" : "Record"}</span>
        </button>
        <button
          type="button"
          className="buttonQuiet"
          onClick={handleProcessText}
          disabled={recording || processing || !body.trim()}
        >
          {processing ? "Processing…" : "Process with LLM"}
        </button>
        <p className="captureStatus" role="status">
          {status}
        </p>
        <button type="submit" className="buttonPrimary" disabled={processing}>
          Save
        </button>
      </div>
    </form>
  );
}
