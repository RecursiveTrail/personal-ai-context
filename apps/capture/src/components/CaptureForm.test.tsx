import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureForm } from "./CaptureForm.js";
import { SPEECH_UNSUPPORTED_MESSAGE } from "../lib/speech.js";
import { loadNotes } from "../store/notesStore.js";
import { saveLlmSettings } from "../store/settingsStore.js";

vi.mock("../lib/llm/client.js", () => ({
  processCapturedText: vi.fn(),
}));

import { processCapturedText } from "../lib/llm/client.js";

let container: HTMLDivElement;
let root: Root;

function setValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) {
  const prototype =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown })
    .webkitSpeechRecognition;
});

describe("CaptureForm", () => {
  it("shows a fallback message when speech recognition is unavailable", () => {
    act(() => root.render(<CaptureForm onSaved={vi.fn()} />));

    expect(container.textContent).toContain(SPEECH_UNSUPPORTED_MESSAGE);
  });

  it("saves a typed note on the chosen shelf, clears the form, and notifies its parent", () => {
    const onSaved = vi.fn();
    act(() => root.render(<CaptureForm onSaved={onSaved} />));

    expect(container.textContent).toContain("How you like things done");
    expect(container.textContent).toContain("Recurring habits");
    expect(container.textContent).toContain(
      "How an assistant should work with you"
    );
    expect(container.textContent).toContain("What you are trying to finish");

    const title = container.querySelector<HTMLInputElement>("#capture-title")!;
    const body = container.querySelector<HTMLTextAreaElement>("#capture-body")!;
    const goals = container.querySelector<HTMLInputElement>(
      'input[name="capture-shelf"][value="goals"]'
    )!;
    act(() => {
      setValue(title, "A useful preference");
      goals.click();
      setValue(body, "Keep answers concise.");
    });

    act(() => {
      container
        .querySelector<HTMLFormElement>("form")!
        .dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true })
        );
    });

    expect(loadNotes()).toMatchObject([
      {
        title: "A useful preference",
        shelf: "goals",
        body: "Keep answers concise.",
      },
    ]);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(title.value).toBe("");
    expect(body.value).toBe("");
    expect(container.textContent).toContain("Note saved.");
  });

  it("switches Record to Stop and shows a listening status", () => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
    }
    (window as unknown as { SpeechRecognition: new () => FakeRecognition }).SpeechRecognition =
      FakeRecognition as unknown as new () => FakeRecognition;

    act(() => root.render(<CaptureForm onSaved={vi.fn()} />));
    const record = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Record")
    )!;

    act(() => record.click());
    expect(record.textContent).toContain("Stop");
    expect(container.textContent).toContain("Listening…");
    expect(record.textContent).not.toContain("Record");

    act(() => record.click());
    expect(record.textContent).toContain("Record");
    expect(container.textContent).not.toContain("Listening…");
  });

  it("processes captured text with the configured llm", async () => {
    saveLlmSettings({ apiKey: "sk-test" });
    vi.mocked(processCapturedText).mockResolvedValue("Keep answers concise.");

    act(() => root.render(<CaptureForm onSaved={vi.fn()} />));

    const body = container.querySelector<HTMLTextAreaElement>("#capture-body")!;
    act(() => {
      setValue(body, "keep answers concise");
    });

    const processButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent === "Process with LLM")!;

    await act(async () => {
      processButton.click();
    });

    expect(processCapturedText).toHaveBeenCalledWith("keep answers concise");
    expect(body.value).toBe("Keep answers concise.");
    expect(container.textContent).toContain(
      "Note processed. Review the text before saving."
    );
  });
});
