import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSpeechController,
  SPEECH_UNSUPPORTED_MESSAGE,
} from "./speech.js";

type FakeRecognition = {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

function installFakeRecognition(factory?: () => FakeRecognition) {
  const instances: FakeRecognition[] = [];
  const SpeechRecognitionMock = function () {
    const recognition =
      factory?.() ??
      ({
        continuous: false,
        interimResults: false,
        onresult: null,
        onerror: null,
        onend: null,
        start: vi.fn(),
        stop: vi.fn(),
      } satisfies FakeRecognition);
    instances.push(recognition);
    return recognition;
  } as unknown as new () => FakeRecognition;
  (window as unknown as { SpeechRecognition: new () => FakeRecognition })
    .SpeechRecognition = SpeechRecognitionMock;
  return instances;
}

afterEach(() => {
  vi.useRealTimers();
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
    const instances = installFakeRecognition();
    const controller = createSpeechController();
    const onText = vi.fn();
    const onError = vi.fn();
    controller.start(onText, onError);
    const recognition = instances[0]!;

    expect(controller.supported).toBe(true);
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);

    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: " first " } }],
    });
    expect(onText).toHaveBeenLastCalledWith({
      committed: "",
      interim: "first",
      text: "first",
    });

    recognition.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: " first sentence " } },
        { isFinal: false, 0: { transcript: " second" } },
      ],
    });
    expect(onText).toHaveBeenLastCalledWith({
      committed: "first sentence",
      interim: "second",
      text: "first sentence second",
    });

    recognition.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: " third sentence" } }],
    });
    expect(onText).toHaveBeenLastCalledWith({
      committed: "first sentence third sentence",
      interim: "",
      text: "first sentence third sentence",
    });

    recognition.onerror?.({ error: "not-allowed" });
    expect(onError).toHaveBeenCalledWith(
      "Mic error or permission denied. Type or paste instead."
    );

    controller.stop();
    expect(recognition.stop).toHaveBeenCalled();
  });

  it("ignores recoverable no-speech errors so a long pause can keep going", () => {
    vi.useFakeTimers();
    const instances = installFakeRecognition();
    const controller = createSpeechController();
    const onError = vi.fn();
    const onListeningChange = vi.fn();
    controller.start(vi.fn(), onError, onListeningChange);
    const recognition = instances[0]!;

    recognition.onerror?.({ error: "no-speech" });
    expect(onError).not.toHaveBeenCalled();
    expect(onListeningChange).toHaveBeenLastCalledWith(true);

    recognition.onend?.();
    vi.runAllTimers();
    expect(instances).toHaveLength(2);
    expect(instances[1]!.start).toHaveBeenCalled();
  });

  it("keeps listening after a transient network speech error", () => {
    vi.useFakeTimers();
    const instances = installFakeRecognition();
    const controller = createSpeechController();
    const onError = vi.fn();
    const onListeningChange = vi.fn();
    const onUpdate = vi.fn();
    controller.start(onUpdate, onError, onListeningChange);
    const first = instances[0]!;

    first.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "first lines" } }],
    });
    first.onerror?.({ error: "network" });
    expect(onError).not.toHaveBeenCalled();
    expect(onListeningChange).toHaveBeenLastCalledWith(true);

    first.onend?.();
    vi.runAllTimers();

    expect(instances).toHaveLength(2);
    instances[1]!.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "still capturing" } }],
    });
    expect(onUpdate).toHaveBeenLastCalledWith({
      committed: "first lines still capturing",
      interim: "",
      text: "first lines still capturing",
    });
  });

  it("restarts even when a network error never fires onend", () => {
    vi.useFakeTimers();
    const instances = installFakeRecognition();
    const controller = createSpeechController();
    const onUpdate = vi.fn();
    controller.start(onUpdate, vi.fn());
    const first = instances[0]!;

    first.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "before blip" } }],
    });
    first.onerror?.({ error: "network" });
    // No onend — stuck engine. Safety timer must open a new session.
    vi.advanceTimersByTime(1000);

    expect(instances.length).toBeGreaterThanOrEqual(2);
    instances[instances.length - 1]!.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "after blip" } }],
    });
    expect(onUpdate).toHaveBeenLastCalledWith({
      committed: "before blip after blip",
      interim: "",
      text: "before blip after blip",
    });
  });

  it("proactively refreshes a long recognition session before Chrome goes mute", () => {
    vi.useFakeTimers();
    const instances = installFakeRecognition();
    const controller = createSpeechController();
    const onUpdate = vi.fn();
    controller.start(onUpdate, vi.fn());
    const first = instances[0]!;

    first.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "long dictation" } }],
    });

    vi.advanceTimersByTime(45_000);
    expect(first.stop).toHaveBeenCalled();
    first.onend?.();
    vi.runAllTimers();

    expect(instances.length).toBeGreaterThanOrEqual(2);
    instances[1]!.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "continues" } }],
    });
    expect(onUpdate).toHaveBeenLastCalledWith({
      committed: "long dictation continues",
      interim: "",
      text: "long dictation continues",
    });
  });

  it("starts a fresh recognition session after the browser ends one mid-listen", () => {
    vi.useFakeTimers();
    const instances = installFakeRecognition();
    const controller = createSpeechController();
    const onText = vi.fn();
    controller.start(onText, vi.fn());
    const first = instances[0]!;

    first.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "kept sentence" } }],
    });
    first.onend?.();
    vi.runAllTimers();

    expect(instances).toHaveLength(2);
    const second = instances[1]!;
    expect(second.start).toHaveBeenCalled();
    expect(second.continuous).toBe(true);

    second.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "next sentence" } }],
    });
    expect(onText).toHaveBeenLastCalledWith({
      committed: "kept sentence next sentence",
      interim: "",
      text: "kept sentence next sentence",
    });

    controller.stop();
    second.onend?.();
    vi.runAllTimers();
    expect(instances).toHaveLength(2);
  });

  it("flushes interim speech into committed text before a silence restart", () => {
    vi.useFakeTimers();
    const instances = installFakeRecognition();
    const controller = createSpeechController();
    const onText = vi.fn();
    controller.start(onText, vi.fn());
    const first = instances[0]!;

    first.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: "proud of comeback" } },
        { isFinal: false, 0: { transcript: "but did not chase it" } },
      ],
    });
    expect(onText).toHaveBeenLastCalledWith({
      committed: "proud of comeback",
      interim: "but did not chase it",
      text: "proud of comeback but did not chase it",
    });

    first.onend?.();
    expect(onText).toHaveBeenLastCalledWith({
      committed: "proud of comeback but did not chase it",
      interim: "",
      text: "proud of comeback but did not chase it",
    });
    vi.runAllTimers();

    const second = instances[1]!;
    second.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "in three games" } }],
    });
    expect(onText).toHaveBeenLastCalledWith({
      committed: "proud of comeback but did not chase it in three games",
      interim: "",
      text: "proud of comeback but did not chase it in three games",
    });
  });

  it("exposes committed and interim text separately for live display", () => {
    const instances = installFakeRecognition();
    const controller = createSpeechController();
    const onUpdate = vi.fn();
    controller.start(onUpdate, vi.fn());
    const recognition = instances[0]!;

    recognition.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: "proud of comeback" } },
        { isFinal: false, 0: { transcript: "but did not chase" } },
      ],
    });

    expect(onUpdate).toHaveBeenLastCalledWith({
      committed: "proud of comeback",
      interim: "but did not chase",
      text: "proud of comeback but did not chase",
    });
  });

  it("keeps earlier text after a 30 second pause with repeated silence cutoffs", () => {
    vi.useFakeTimers();
    const instances = installFakeRecognition();
    const controller = createSpeechController();
    const onText = vi.fn();
    const onError = vi.fn();
    const onListeningChange = vi.fn();
    controller.start(onText, onError, onListeningChange);

    instances[0]!.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "hello from the start" } }],
    });
    expect(onText).toHaveBeenLastCalledWith({
      committed: "hello from the start",
      interim: "",
      text: "hello from the start",
    });

    // Chrome ends continuous recognition after silence about every few seconds.
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const current = instances[cycle]!;
      current.onerror?.({ error: "no-speech" });
      current.onend?.();
      vi.advanceTimersByTime(300);
    }

    expect(onError).not.toHaveBeenCalled();
    expect(onListeningChange).toHaveBeenLastCalledWith(true);
    expect(instances.length).toBeGreaterThanOrEqual(5);

    const latest = instances[instances.length - 1]!;
    latest.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "and after the pause" } }],
    });
    expect(onText).toHaveBeenLastCalledWith({
      committed: "hello from the start and after the pause",
      interim: "",
      text: "hello from the start and after the pause",
    });
  });

  it("keeps retrying recognition restarts while the user is still recording", () => {
    vi.useFakeTimers();
    let attempt = 0;
    const instances = installFakeRecognition(() => {
      attempt += 1;
      return {
        continuous: false,
        interimResults: false,
        onresult: null,
        onerror: null,
        onend: null,
        start:
          attempt === 1 || attempt > 6
            ? vi.fn()
            : vi.fn(() => {
                throw new Error("already started");
              }),
        stop: vi.fn(),
      };
    });
    const controller = createSpeechController();
    const onError = vi.fn();
    const onListeningChange = vi.fn();
    controller.start(vi.fn(), onError, onListeningChange);

    instances[0]!.onend?.();
    for (let step = 0; step < 20; step += 1) {
      vi.advanceTimersByTime(500);
    }

    expect(onError).not.toHaveBeenCalled();
    expect(onListeningChange).toHaveBeenLastCalledWith(true);
    expect(instances.length).toBeGreaterThan(6);
    expect(instances[instances.length - 1]!.start).toHaveBeenCalled();
  });
});
