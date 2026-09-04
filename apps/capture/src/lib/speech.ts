type SpeechResult = {
  readonly [index: number]: { transcript: string };
};

type SpeechResultEvent = {
  readonly results: ArrayLike<SpeechResult>;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
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

  return {
    supported: Boolean(SpeechRecognition),
    start(onText, onError) {
      if (!SpeechRecognition) {
        onError(SPEECH_UNSUPPORTED_MESSAGE);
        return;
      }

      active?.stop();
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let text = "";
        for (let index = 0; index < event.results.length; index += 1) {
          text += event.results[index][0].transcript;
        }
        onText(text.trim());
      };
      recognition.onerror = () =>
        onError("Mic error or permission denied. Type or paste instead.");
      active = recognition;
      recognition.start();
    },
    stop() {
      active?.stop();
      active = null;
    },
  };
}
