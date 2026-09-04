import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSpeechController,
  SPEECH_UNSUPPORTED_MESSAGE,
} from "./speech.js";

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
});

describe("createSpeechController", () => {
  it("reports an actionable fallback when speech recognition is unsupported", () => {
    const controller = createSpeechController();
    const onError = vi.fn();

    expect(controller.supported).toBe(false);
    controller.start(vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(SPEECH_UNSUPPORTED_MESSAGE);
  });

  it("commits final chunks and keeps interim preview without losing earlier sentences", () => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
    }

    const recognition = new FakeRecognition();
    const SpeechRecognitionMock = function () {
      return recognition;
    } as unknown as new () => FakeRecognition;
    (window as unknown as { SpeechRecognition: new () => FakeRecognition })
      .SpeechRecognition = SpeechRecognitionMock;

    const controller = createSpeechController();
    const onText = vi.fn();
    const onError = vi.fn();
    controller.start(onText, onError);

    expect(controller.supported).toBe(true);
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);

    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: " first " } }],
    });
    expect(onText).toHaveBeenLastCalledWith("first");

    recognition.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: " first sentence " } },
        { isFinal: false, 0: { transcript: " second" } },
      ],
    });
    expect(onText).toHaveBeenLastCalledWith("first sentence second");

    // Browser drops earlier results from the array (common on long takes).
    // Committed chunk must still survive.
    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: " third sentence" } }],
    });
    expect(onText).toHaveBeenLastCalledWith("first sentence third sentence");

    recognition.onerror?.();
    expect(onError).toHaveBeenCalledWith(
      "Mic error or permission denied. Type or paste instead."
    );

    controller.stop();
    expect(recognition.stop).toHaveBeenCalled();
  });

  it("restarts recognition after an unexpected end while still listening", () => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
    }

    const recognition = new FakeRecognition();
    const SpeechRecognitionMock = function () {
      return recognition;
    } as unknown as new () => FakeRecognition;
    (window as unknown as { SpeechRecognition: new () => FakeRecognition })
      .SpeechRecognition = SpeechRecognitionMock;

    const controller = createSpeechController();
    controller.start(vi.fn(), vi.fn());
    expect(recognition.start).toHaveBeenCalledTimes(1);

    recognition.onend?.();
    expect(recognition.start).toHaveBeenCalledTimes(2);

    controller.stop();
    recognition.onend?.();
    expect(recognition.start).toHaveBeenCalledTimes(2);
  });
});
