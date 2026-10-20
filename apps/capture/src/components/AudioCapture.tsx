import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { captureTag, quickNoteTitle, type CaptureSource } from "../display.js";
import {
  createSpeechController,
  SPEECH_LISTENING_HINT,
  SPEECH_UNSUPPORTED_MESSAGE,
} from "../lib/speech.js";
import { saveNote } from "../store/notesStore.js";
import type { ShelfRecord } from "../store/shelvesStore.js";
import { MicIcon } from "./Icons.js";

type AudioCaptureProps = {
  shelves: ShelfRecord[];
  onSaved: () => void;
  onStorageError: (message: string) => void;
};

export function AudioCapture({ shelves, onSaved, onStorageError }: AudioCaptureProps) {
  const speech = useMemo(() => createSpeechController(), []);
  const speechPrefix = useRef("");
  const [shelf, setShelf] = useState(shelves[0]?.slug ?? "preferences");
  const [body, setBody] = useState("");
  const [source, setSource] = useState<CaptureSource>("text");
  const [recording, setRecording] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [message, setMessage] = useState(
    speech.supported ? "" : SPEECH_UNSUPPORTED_MESSAGE
  );
  const [messageIsError, setMessageIsError] = useState(!speech.supported);

  useEffect(() => () => speech.stop(), [speech]);

  function startRecording() {
    speechPrefix.current = body.trimEnd();
    setMessage("");
    setMessageIsError(false);
    setSource("voice");
    speech.start(
      (text) => {
        const separator = speechPrefix.current && text ? "\n" : "";
        setBody(`${speechPrefix.current}${separator}${text}`);
      },
      (error) => {
        setRecording(false);
        if (error.toLowerCase().includes("permission")) setMicBlocked(true);
        setMessage(error);
        setMessageIsError(true);
      },
      (listening) => {
        setRecording(listening);
        if (listening) {
          setMessage("");
          setMessageIsError(false);
        }
      }
    );
  }

  function stopRecording() {
    speech.stop();
    setRecording(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    try {
      saveNote({
        title: quickNoteTitle(text),
        shelf,
        body: text,
        tags: [captureTag(source)],
      });
      stopRecording();
      setBody("");
      setSource("text");
      setMessage("Note saved.");
      setMessageIsError(false);
      onSaved();
    } catch (error) {
      const textError = error instanceof Error ? error.message : "Could not save note.";
      setMessage(textError);
      setMessageIsError(true);
      if (textError.toLowerCase().includes("storage full")) onStorageError(textError);
    }
  }

  const status = recording ? SPEECH_LISTENING_HINT : message;

  return (
    <section className="audioCapture" aria-labelledby="audio-heading">
      <p className="eyebrow">Dictation</p>
      <h2 id="audio-heading">Audio Capture</h2>
      <p>
        Speak a note, review the transcript, then save it to a shelf. You can
        pause for 30 seconds or longer; earlier text stays, and dictation
        restarts after the browser cuts off silence.
      </p>
      <form className="stackForm audioForm" onSubmit={submit}>
        <label className="fieldLabel" htmlFor="audio-shelf">
          Shelf
        </label>
        <select
          id="audio-shelf"
          value={shelf}
          onChange={(event) => setShelf(event.target.value)}
        >
          {shelves.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
        <label className="fieldLabel" htmlFor="audio-transcript">
          Transcript
        </label>
        <textarea
          id="audio-transcript"
          rows={8}
          value={body}
          placeholder="Press Record and speak. You can also type here."
          onChange={(event) => setBody(event.target.value)}
        />
        {status ? (
          <p className={messageIsError ? "banner bannerError" : "captureStatus"} role="status">
            {status}
          </p>
        ) : null}
        <div className="modalActions">
          <button
            type="button"
            className={recording ? "buttonPrimary isRecording" : "buttonSecondary"}
            onClick={recording ? stopRecording : startRecording}
            disabled={micBlocked || (!recording && !speech.supported)}
          >
            <MicIcon />
            <span>{recording ? "Stop" : "Record"}</span>
          </button>
          <button type="submit" className="buttonPrimary" disabled={!body.trim()}>
            Save to shelf
          </button>
        </div>
      </form>
    </section>
  );
}
