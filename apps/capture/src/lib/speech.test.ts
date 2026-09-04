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

  it("streams recognized text and reports microphone errors", () => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
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
      results: [{ 0: { transcript: " hello " } }, { 0: { transcript: "world" } }],
    });
    expect(onText).toHaveBeenCalledWith("hello world");
    recognition.onerror?.();
    expect(onError).toHaveBeenCalledWith(
      "Mic error or permission denied. Type or paste instead."
    );

    controller.stop();
    expect(recognition.stop).toHaveBeenCalled();
  });
});
