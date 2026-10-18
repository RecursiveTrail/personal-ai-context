import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  captureTag,
  quickNoteTitle,
  type CaptureSource,
} from "../display.js";
import { readCaptureFile } from "../lib/ingestFile.js";
import { processCapturedText } from "../lib/llm/client.js";
import { consumePendingDraft } from "../pendingDraft.js";
import {
  createSpeechController,
  SPEECH_UNSUPPORTED_MESSAGE,
} from "../lib/speech.js";
import { saveNote } from "../store/notesStore.js";
import { isLlmConfigured } from "../store/settingsStore.js";
import { AttachIcon, MicIcon } from "./Icons.js";

type CaptureFormProps = {
  shelf: string;
  shelfName: string;
  onSaved: () => void;
  onStorageError?: (message: string) => void;
};

export type CaptureFormHandle = {
  appendFiles: (files: File[]) => Promise<void>;
  appendText: (text: string, source: CaptureSource) => void;
  focus: () => void;
};

export const CaptureForm = forwardRef<CaptureFormHandle, CaptureFormProps>(
  function CaptureForm({ shelf, shelfName, onSaved, onStorageError }, ref) {
    const speech = useMemo(() => createSpeechController(), []);
    const speechPrefix = useRef("");
    const fileInput = useRef<HTMLInputElement>(null);
    const fieldRef = useRef<HTMLTextAreaElement>(null);
    const [draft] = useState(() => consumePendingDraft());
    const [body, setBody] = useState(draft?.text ?? "");
    const [source, setSource] = useState<CaptureSource>(draft?.source ?? "text");
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [readingFile, setReadingFile] = useState(false);
    const [micBlocked, setMicBlocked] = useState(false);
    const [message, setMessage] = useState(
      draft?.message ?? (speech.supported ? "" : SPEECH_UNSUPPORTED_MESSAGE)
    );
    const [messageIsError, setMessageIsError] = useState(
      draft?.messageIsError ?? !speech.supported
    );
    const llmConfigured = isLlmConfigured();

    useEffect(() => () => speech.stop(), [speech]);

    useEffect(() => {
      const field = fieldRef.current;
      if (!field) return;
      field.style.height = "auto";
      field.style.height = `${Math.min(field.scrollHeight, 240)}px`;
    }, [body]);

    function report(text: string, isError: boolean) {
      setMessage(text);
      setMessageIsError(isError);
    }

    function startRecording() {
      speechPrefix.current = body.trimEnd();
      report("", false);
      setSource("voice");
      speech.start(
        (text) => {
          const separator = speechPrefix.current && text ? "\n" : "";
          setBody(`${speechPrefix.current}${separator}${text}`);
        },
        (error) => {
          setRecording(false);
          setMicBlocked(true);
          report(error, true);
        }
      );
      if (speech.supported) setRecording(true);
    }

    function stopRecording() {
      speech.stop();
      setRecording(false);
    }

    async function appendFiles(files: File[], mode: "append" | "replace" = "append") {
      if (files.length === 0) return;
      setReadingFile(true);
      report("", false);
      const texts: string[] = [];
      let nextSource: CaptureSource = source;
      try {
        for (const file of files) {
          const result = await readCaptureFile(file);
          if (!result.ok) {
            report(result.message, true);
            continue;
          }
          texts.push(result.text);
          nextSource = result.source;
        }
        if (texts.length > 0) {
          const addition = texts.join("\n\n");
          setBody((current) =>
            mode === "replace" || !current.trim()
              ? addition
              : `${current.trim()}\n\n${addition}`
          );
          setSource(nextSource);
        }
      } finally {
        setReadingFile(false);
      }
    }

    useImperativeHandle(ref, () => ({
      appendFiles,
      appendText(text, nextSource) {
        setBody((current) =>
          current.trim() ? `${current.trim()}\n\n${text.trim()}` : text.trim()
        );
        setSource(nextSource);
        fieldRef.current?.focus();
      },
      focus() {
        fieldRef.current?.focus();
      },
    }));

    async function handleFile(event: ChangeEvent<HTMLInputElement>) {
      const files = event.target.files ? [...event.target.files] : [];
      event.target.value = "";
      await appendFiles(files, "replace");
    }

    async function handleProcessText() {
      if (!body.trim()) {
        report("Add note text before processing.", true);
        return;
      }
      if (!llmConfigured) {
        report("Add an API key in LLM settings first.", true);
        return;
      }

      setProcessing(true);
      report("", false);
      try {
        const processed = await processCapturedText(body);
        setBody(processed);
        report("Note processed. Review the text before saving.", false);
      } catch (error) {
        report(
          error instanceof Error ? error.message : "Could not process note text.",
          true
        );
      } finally {
        setProcessing(false);
      }
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
        report("Note saved.", false);
        onSaved();
      } catch (error) {
        const textError =
          error instanceof Error ? error.message : "Could not save note.";
        report(textError, true);
        if (textError.toLowerCase().includes("storage full")) onStorageError?.(textError);
      }
    }

    function clearSavedNotice() {
      setMessage((current) => (current === "Note saved." ? "" : current));
    }

    const saved = message === "Note saved.";
    const status = recording
      ? "Listening… Review the text before saving."
      : readingFile
        ? "Reading PDF…"
        : saved
          ? "Note saved."
          : "";
    const bannerMessage = saved || recording || readingFile ? "" : message;

    return (
      <form className="quickCapture" onSubmit={submit}>
        <div className="quickBar">
          <label className="srOnly" htmlFor="quick-note">
            Quick note for {shelfName}
          </label>
          <textarea
            id="quick-note"
            ref={fieldRef}
            rows={1}
            value={body}
            placeholder={`Quick note for ${shelfName}... Press Enter or capture audio`}
            onChange={(event) => {
              setBody(event.target.value);
              clearSavedNotice();
            }}
            onPaste={() => setSource("clipboard")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={processing || readingFile}
          />
          <div className="quickActions">
            <button
              id="record-note"
              type="button"
              className={recording ? "iconButton isRecording" : "iconButton"}
              onClick={recording ? stopRecording : startRecording}
              disabled={
                processing ||
                readingFile ||
                micBlocked ||
                (!recording && !speech.supported)
              }
            >
              <MicIcon />
              {recording ? <span>Stop</span> : <span className="srOnly">Record</span>}
            </button>
            <input
              ref={fileInput}
              className="fileInput"
              type="file"
              accept="application/pdf,.pdf,text/plain,.txt,.md,.markdown,audio/*"
              aria-hidden="true"
              tabIndex={-1}
              multiple
              onChange={handleFile}
            />
            <button
              type="button"
              className="iconButton"
              aria-label="Attach file"
              onClick={() => fileInput.current?.click()}
              disabled={recording || processing || readingFile}
            >
              <AttachIcon />
            </button>
            <button
              type="submit"
              className="buttonPrimary"
              disabled={processing || readingFile || !body.trim()}
            >
              Add
            </button>
          </div>
        </div>
        <div className="quickMeta">
          {bannerMessage ? (
            <p className={messageIsError ? "banner bannerError" : "banner"} role="status">
              {bannerMessage}
            </p>
          ) : null}
          <p className="captureStatus" role="status">
            {status}
          </p>
          <button
            type="button"
            className="textAction"
            onClick={handleProcessText}
            disabled={recording || processing || readingFile || !body.trim()}
          >
            {processing ? "Processing…" : "Process with LLM"}
          </button>
        </div>
      </form>
    );
  }
);
