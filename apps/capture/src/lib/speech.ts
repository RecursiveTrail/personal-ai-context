type SpeechAlternative = { transcript: string };

type SpeechResult = {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechAlternative;
};

type SpeechResultEvent = {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechResult>;
};

type SpeechRecognitionErrorEvent = {
  readonly error: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export const SPEECH_UNSUPPORTED_MESSAGE =
  "Speech recognition is unavailable. Type or paste your note instead.";

export const SPEECH_SESSION_ENDED_MESSAGE =
  "The browser ended dictation. Press Record to continue from where you left off.";

export const SPEECH_LISTENING_HINT =
  "Listening… You can pause for half a minute or more; earlier text stays, and dictation restarts after browser silence cutoffs.";

const RECOVERABLE_ERRORS = new Set(["no-speech", "aborted"]);
const RESTART_DELAY_MS = 250;
const RESTART_ATTEMPTS = 4;

export type SpeechController = {
  supported: boolean;
  start: (
    onText: (text: string) => void,
    onError: (message: string) => void,
    onListeningChange?: (listening: boolean) => void
  ) => void;
  stop: () => void;
};

function appendTranscript(base: string, chunk: string): string {
  const next = chunk.trim();
  if (!next) return base;
  if (!base) return next;
  return `${base} ${next}`;
}

export function createSpeechController(): SpeechController {
  const speechWindow =
    typeof window === "undefined"
      ? undefined
      : (window as unknown as {
          SpeechRecognition?: SpeechRecognitionConstructor;
          webkitSpeechRecognition?: SpeechRecognitionConstructor;
        });
  const SpeechRecognition =
    speechWindow?.SpeechRecognition ?? speechWindow?.webkitSpeechRecognition;
  let active: SpeechRecognitionInstance | null = null;
  let listening = false;
  let committed = "";
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let onTextCb: ((text: string) => void) | null = null;
  let onErrorCb: ((message: string) => void) | null = null;
  let onListeningChangeCb: ((listening: boolean) => void) | null = null;

  function clearRestart() {
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function setListening(next: boolean) {
    if (listening === next) return;
    listening = next;
    onListeningChangeCb?.(next);
  }

  function emit(interim: string) {
    onTextCb?.(appendTranscript(committed, interim));
  }

  function fail(message: string) {
    clearRestart();
    setListening(false);
    const recognition = active;
    active = null;
    recognition?.stop();
    onErrorCb?.(message);
  }

  function wire(recognition: SpeechRecognitionInstance) {
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          committed = appendTranscript(committed, transcript);
        } else {
          interim = appendTranscript(interim, transcript);
        }
      }
      emit(interim);
    };

    recognition.onerror = (event) => {
      if (RECOVERABLE_ERRORS.has(event.error)) return;
      fail("Mic error or permission denied. Type or paste instead.");
    };

    // Chrome ends continuous sessions after a few seconds of silence.
    // Keep `committed` and open a fresh instance so a 30s pause can continue.
    recognition.onend = () => {
      if (!listening || active !== recognition) return;
      scheduleRestart(0);
    };
  }

  function scheduleRestart(attempt: number) {
    clearRestart();
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!listening || !SpeechRecognition) return;
      try {
        const next = new SpeechRecognition();
        active = next;
        wire(next);
        next.start();
      } catch {
        if (attempt + 1 < RESTART_ATTEMPTS) {
          scheduleRestart(attempt + 1);
          return;
        }
        fail(SPEECH_SESSION_ENDED_MESSAGE);
      }
    }, RESTART_DELAY_MS * (attempt + 1));
  }

  return {
    supported: Boolean(SpeechRecognition),
    start(onText, onError, onListeningChange) {
      if (!SpeechRecognition) {
        onError(SPEECH_UNSUPPORTED_MESSAGE);
        return;
      }

      clearRestart();
      listening = false;
      active?.stop();
      committed = "";
      onTextCb = onText;
      onErrorCb = onError;
      onListeningChangeCb = onListeningChange ?? null;

      const recognition = new SpeechRecognition();
      active = recognition;
      wire(recognition);
      setListening(true);
      recognition.start();
    },
    stop() {
      clearRestart();
      listening = false;
      onListeningChangeCb?.(false);
      active?.stop();
      active = null;
      committed = "";
      onTextCb = null;
      onErrorCb = null;
      onListeningChangeCb = null;
    },
  };
}
