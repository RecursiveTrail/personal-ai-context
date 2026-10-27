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
  lang?: string;
  maxAlternatives?: number;
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
  "Listening… Words keep appending. The desk refreshes the browser mic session in the background so long dictation does not go mute.";

// Permission / hardware failures only. Chrome often emits `network` mid-session
// even while the mic is fine; treat those as a restart, not a hard stop.
const FATAL_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
]);
const RESTART_DELAY_MS = 250;
const RESTART_DELAY_MAX_MS = 2000;
/** Chrome continuous recognition often dies near ~60s; refresh earlier. */
const SESSION_REFRESH_MS = 45_000;
/** If onend never follows a soft error, force a new session. */
const SOFT_ERROR_RECOVERY_MS = 400;

export type SpeechUpdate = {
  committed: string;
  interim: string;
  text: string;
};

export type SpeechController = {
  supported: boolean;
  start: (
    onUpdate: (update: SpeechUpdate) => void,
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

function toUpdate(committed: string, interim: string): SpeechUpdate {
  return {
    committed,
    interim,
    text: appendTranscript(committed, interim),
  };
}

function detach(recognition: SpeechRecognitionInstance) {
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
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
  let interim = "";
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  let onUpdateCb: ((update: SpeechUpdate) => void) | null = null;
  let onErrorCb: ((message: string) => void) | null = null;
  let onListeningChangeCb: ((listening: boolean) => void) | null = null;

  function clearRestart() {
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function clearKeepAlive() {
    if (keepAliveTimer !== null) {
      clearTimeout(keepAliveTimer);
      keepAliveTimer = null;
    }
  }

  function setListening(next: boolean) {
    if (listening === next) return;
    listening = next;
    onListeningChangeCb?.(next);
  }

  function emit() {
    onUpdateCb?.(toUpdate(committed, interim));
  }

  function flushInterim() {
    if (!interim) return;
    committed = appendTranscript(committed, interim);
    interim = "";
    emit();
  }

  function retire(recognition: SpeechRecognitionInstance | null) {
    if (!recognition) return;
    detach(recognition);
    try {
      recognition.stop();
    } catch {
      // Already stopped.
    }
    if (active === recognition) active = null;
  }

  function fail(message: string) {
    clearRestart();
    clearKeepAlive();
    flushInterim();
    setListening(false);
    const recognition = active;
    active = null;
    if (recognition) {
      detach(recognition);
      try {
        recognition.stop();
      } catch {
        // Ignore.
      }
    }
    onErrorCb?.(message);
  }

  function armKeepAlive(recognition: SpeechRecognitionInstance) {
    clearKeepAlive();
    keepAliveTimer = setTimeout(() => {
      keepAliveTimer = null;
      if (!listening || active !== recognition) return;
      // Force onend → restart before Chrome's continuous session goes mute.
      try {
        recognition.stop();
      } catch {
        flushInterim();
        retire(recognition);
        scheduleRestart(0);
      }
    }, SESSION_REFRESH_MS);
  }

  function wire(recognition: SpeechRecognitionInstance) {
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    if (typeof navigator !== "undefined" && navigator.language) {
      recognition.lang = navigator.language;
    }

    recognition.onresult = (event) => {
      let nextInterim = "";
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
          nextInterim = appendTranscript(nextInterim, transcript);
        }
      }
      interim = nextInterim;
      emit();
    };

    recognition.onerror = (event) => {
      if (FATAL_ERRORS.has(event.error)) {
        fail("Mic error or permission denied. Type or paste instead.");
        return;
      }
      // Soft errors (network, no-speech, aborted, …). onend usually follows;
      // if it does not, recover anyway so dictation does not go mute.
      clearRestart();
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (!listening || active !== recognition) return;
        flushInterim();
        retire(recognition);
        scheduleRestart(0);
      }, SOFT_ERROR_RECOVERY_MS);
    };

    recognition.onend = () => {
      if (!listening) return;
      clearKeepAlive();
      if (active === recognition) {
        flushInterim();
        detach(recognition);
        active = null;
        scheduleRestart(0);
      }
    };
  }

  function scheduleRestart(attempt: number) {
    clearRestart();
    const delay = Math.min(
      RESTART_DELAY_MS * (attempt + 1),
      RESTART_DELAY_MAX_MS
    );
    restartTimer = setTimeout(() => {
      restartTimer = null;
      openSession(attempt);
    }, delay);
  }

  function openSession(attempt: number) {
    if (!listening || !SpeechRecognition) return;
    try {
      const next = new SpeechRecognition();
      const previous = active;
      active = next;
      wire(next);
      if (previous && previous !== next) {
        detach(previous);
        try {
          previous.stop();
        } catch {
          // Ignore.
        }
      }
      next.start();
      armKeepAlive(next);
    } catch {
      // InvalidStateError is common if the previous instance is still
      // tearing down. Keep retrying while Record is active.
      scheduleRestart(attempt + 1);
    }
  }

  return {
    supported: Boolean(SpeechRecognition),
    start(onUpdate, onError, onListeningChange) {
      if (!SpeechRecognition) {
        onError(SPEECH_UNSUPPORTED_MESSAGE);
        return;
      }

      clearRestart();
      clearKeepAlive();
      listening = false;
      retire(active);
      committed = "";
      interim = "";
      onUpdateCb = onUpdate;
      onErrorCb = onError;
      onListeningChangeCb = onListeningChange ?? null;

      setListening(true);
      openSession(0);
    },
    stop() {
      clearRestart();
      clearKeepAlive();
      flushInterim();
      listening = false;
      onListeningChangeCb?.(false);
      retire(active);
      active = null;
      committed = "";
      interim = "";
      onUpdateCb = null;
      onErrorCb = null;
      onListeningChangeCb = null;
    },
  };
}
