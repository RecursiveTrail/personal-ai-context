import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { captureTag, quickNoteTitle, type CaptureSource } from "../display.js";
import {
  createSpeechController,
  type SpeechUpdate,
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

type Phase = "idle" | "recording" | "review";

const EMPTY_UPDATE: SpeechUpdate = { committed: "", interim: "", text: "" };

export function AudioCapture({ shelves, onSaved, onStorageError }: AudioCaptureProps) {
  const speech = useMemo(() => createSpeechController(), []);
  const liveRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<SpeechUpdate>(EMPTY_UPDATE);
  const [shelf, setShelf] = useState(shelves[0]?.slug ?? "preferences");
  const [phase, setPhase] = useState<Phase>("idle");
  const [committed, setCommitted] = useState("");
  const [interim, setInterim] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [source, setSource] = useState<CaptureSource>("voice");
  const [micBlocked, setMicBlocked] = useState(false);
  const [message, setMessage] = useState(
    speech.supported ? "" : SPEECH_UNSUPPORTED_MESSAGE
  );
  const [messageIsError, setMessageIsError] = useState(!speech.supported);

  useEffect(() => () => speech.stop(), [speech]);

  useEffect(() => {
    if (phase !== "recording") return;
    const node = liveRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [phase, committed, interim]);

  function applyUpdate(update: SpeechUpdate) {
    latestRef.current = update;
    setCommitted(update.committed);
    setInterim(update.interim);
  }

  function startRecording() {
    latestRef.current = EMPTY_UPDATE;
    setCommitted("");
    setInterim("");
    setReviewBody("");
    setMessage("");
    setMessageIsError(false);
    setSource("voice");
    setPhase("recording");
    speech.start(
      applyUpdate,
      (error) => {
        const text = latestRef.current.text.trim();
        setReviewBody(text);
        setInterim("");
        setPhase(text ? "review" : "idle");
        if (error.toLowerCase().includes("permission")) setMicBlocked(true);
        setMessage(error);
        setMessageIsError(true);
      },
      (listening) => {
        if (listening) {
          setMessage("");
          setMessageIsError(false);
        }
      }
    );
  }

  function stopRecording() {
    speech.stop();
    const text = latestRef.current.text.trim();
    setReviewBody(text);
    setCommitted(latestRef.current.committed);
    setInterim("");
    setPhase(text ? "review" : "idle");
    setMessage("");
    setMessageIsError(false);
  }

  function discardReview() {
    latestRef.current = EMPTY_UPDATE;
    setReviewBody("");
    setCommitted("");
    setInterim("");
    setPhase("idle");
    setMessage("");
    setMessageIsError(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = reviewBody.trim();
    if (!text) return;
    try {
      saveNote({
        title: quickNoteTitle(text),
        shelf,
        body: text,
        tags: [captureTag(source)],
      });
      setReviewBody("");
      setCommitted("");
      setInterim("");
      setPhase("idle");
      setSource("voice");
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

  const status =
    phase === "recording"
      ? SPEECH_LISTENING_HINT
      : message;

  return (
    <section className="audioCapture" aria-labelledby="audio-heading">
      <p className="eyebrow">Dictation</p>
      <h2 id="audio-heading">Audio Capture</h2>
      <p>
        Speak freely. Words append as the browser finalizes them. While
        recording you only watch the transcript; after Stop you can edit, then
        save the text exactly as it is.
      </p>

      {phase !== "review" ? (
        <div className="audioRecordPanel">
          <label className="fieldLabel" htmlFor="audio-shelf">
            Shelf
          </label>
          <select
            id="audio-shelf"
            value={shelf}
            onChange={(event) => setShelf(event.target.value)}
            disabled={phase === "recording"}
          >
            {shelves.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>

          <div
            ref={liveRef}
            className="audioLiveTranscript"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {committed || interim ? (
              <>
                {committed ? <p className="audioCommitted">{committed}</p> : null}
                {interim ? <p className="audioInterim">{interim}</p> : null}
              </>
            ) : (
              <p className="audioLivePlaceholder">
                {phase === "recording"
                  ? "Listening…"
                  : "Press Record and speak. The transcript appears here."}
              </p>
            )}
          </div>

          {status ? (
            <p
              className={messageIsError ? "banner bannerError" : "captureStatus"}
              role="status"
            >
              {status}
            </p>
          ) : null}

          <div className="modalActions">
            <button
              type="button"
              className={
                phase === "recording" ? "buttonPrimary isRecording" : "buttonSecondary"
              }
              onClick={phase === "recording" ? stopRecording : startRecording}
              disabled={micBlocked || (!speech.supported && phase !== "recording")}
            >
              <MicIcon />
              <span>{phase === "recording" ? "Stop" : "Record"}</span>
            </button>
          </div>
        </div>
      ) : (
        <form className="stackForm audioForm" onSubmit={submit}>
          <label className="fieldLabel" htmlFor="audio-shelf-review">
            Shelf
          </label>
          <select
            id="audio-shelf-review"
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
            Review transcript
          </label>
          <textarea
            id="audio-transcript"
            rows={10}
            value={reviewBody}
            onChange={(event) => setReviewBody(event.target.value)}
            autoFocus
          />
          {status ? (
            <p
              className={messageIsError ? "banner bannerError" : "captureStatus"}
              role="status"
            >
              {status}
            </p>
          ) : (
            <p className="captureStatus" role="status">
              Edit if you want, then save. Nothing is rewritten automatically.
            </p>
          )}
          <div className="modalActions">
            <button type="button" className="buttonSecondary" onClick={discardReview}>
              Discard
            </button>
            <button type="button" className="buttonSecondary" onClick={startRecording}>
              <MicIcon />
              <span>Record again</span>
            </button>
            <button type="submit" className="buttonPrimary" disabled={!reviewBody.trim()}>
              Save to shelf
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
