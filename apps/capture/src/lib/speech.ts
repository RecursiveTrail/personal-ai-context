type SpeechAlternative = { transcript: string };

type SpeechResult = {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechAlternative;
};

type SpeechResultEvent = {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechResult>;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export const SPEECH_UNSUPPORTED_MESSAGE =
  "Speech recognition is unavailable. Type or paste your note instead.";

export type SpeechController = {
  supported: boolean;
  start: (
    onText: (text: string) => void,
    onError: (message: string) => void
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

  function emit(onText: (text: string) => void, interim: string) {
    onText(appendTranscript(committed, interim));
  }

  return {
    supported: Boolean(SpeechRecognition),
    start(onText, onError) {
      if (!SpeechRecognition) {
        onError(SPEECH_UNSUPPORTED_MESSAGE);
        return;
      }

      listening = false;
      active?.stop();
      committed = "";

      const recognition = new SpeechRecognition();
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
        emit(onText, interim);
      };

      recognition.onerror = () => {
        listening = false;
        onError("Mic error or permission denied. Type or paste instead.");
      };

      // Chrome often ends continuous sessions after a pause; restart so
      // later sentences keep appending to the already-committed chunks.
      recognition.onend = () => {
        if (!listening || active !== recognition) return;
        try {
          recognition.start();
        } catch {
          listening = false;
        }
      };

      active = recognition;
      listening = true;
      recognition.start();
    },
    stop() {
      listening = false;
      active?.stop();
      active = null;
      committed = "";
    },
  };
}
