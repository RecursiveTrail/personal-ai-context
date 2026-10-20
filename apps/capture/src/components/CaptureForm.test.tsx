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

vi.mock("../lib/pdfText.js", () => ({
  extractPdfText: vi.fn(),
  PDF_UNREADABLE_MESSAGE: "This PDF has no selectable text.",
}));

import { processCapturedText } from "../lib/llm/client.js";
import { extractPdfText } from "../lib/pdfText.js";

let container: HTMLDivElement;
let root: Root;

async function finishPdfImport() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!container.textContent?.includes("Reading PDF…")) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function setValue(element: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderForm(onSaved = vi.fn(), shelf = "goals") {
  act(() =>
    root.render(
      <CaptureForm shelf={shelf} shelfName="Goals" onSaved={onSaved} />
    )
  );
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
    renderForm();
    expect(container.textContent).toContain(SPEECH_UNSUPPORTED_MESSAGE);
  });

  it("saves a typed note on the shelf, clears the field, and notifies its parent", () => {
    const onSaved = vi.fn();
    renderForm(onSaved, "goals");
    const field = container.querySelector<HTMLTextAreaElement>("#quick-note")!;
    act(() => {
      setValue(field, "A useful preference\nKeep answers concise.");
    });
    act(() => {
      field.closest("form")!.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true })
      );
    });

    expect(loadNotes()).toMatchObject([
      {
        title: "A useful preference",
        shelf: "goals",
        body: "A useful preference\nKeep answers concise.",
        tags: ["capture:text"],
      },
    ]);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(field.value).toBe("");
    expect(container.textContent).toContain("Note saved.");
  });

  it("switches Record to Stop and shows a listening status", () => {
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start = vi.fn();
      stop = vi.fn();
    }
    (window as unknown as { SpeechRecognition: new () => FakeRecognition }).SpeechRecognition =
      FakeRecognition as unknown as new () => FakeRecognition;

    renderForm();
    const record = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Record")
    )!;

    act(() => record.click());
    expect(record.textContent).toContain("Stop");
    expect(container.textContent).toContain("Listening…");
    expect(container.textContent).toContain("dictation restarts");
    expect(record.textContent).not.toContain("Record");

    act(() => record.click());
    expect(record.textContent).toContain("Record");
    expect(container.textContent).not.toContain("Listening…");
  });

  it("processes captured text with the configured llm", async () => {
    saveLlmSettings({ apiKey: "sk-test" });
    vi.mocked(processCapturedText).mockResolvedValue("Keep answers concise.");
    renderForm();

    const field = container.querySelector<HTMLTextAreaElement>("#quick-note")!;
    act(() => {
      setValue(field, "keep answers concise");
    });

    const processButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Process with LLM"
    )!;

    await act(async () => {
      processButton.click();
    });

    expect(processCapturedText).toHaveBeenCalledWith("keep answers concise");
    expect(field.value).toBe("Keep answers concise.");
    expect(container.textContent).toContain(
      "Note processed. Review the text before saving."
    );
  });

  it("puts extracted PDF text in the note field without saving", async () => {
    vi.mocked(extractPdfText).mockResolvedValue("First page\n\nSecond page");
    renderForm();
    const field = container.querySelector<HTMLTextAreaElement>("#quick-note")!;
    act(() => {
      setValue(field, "Replace this draft");
    });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["%PDF"], "notes.pdf", { type: "application/pdf" });
    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await finishPdfImport();

    expect(extractPdfText).toHaveBeenCalledOnce();
    expect(field.value).toBe("First page\n\nSecond page");
    expect(loadNotes()).toEqual([]);
  });

  it("leaves the note field unchanged when PDF import fails", async () => {
    vi.mocked(extractPdfText).mockRejectedValue(
      new Error("This PDF has no selectable text.")
    );
    renderForm();
    const field = container.querySelector<HTMLTextAreaElement>("#quick-note")!;
    act(() => {
      setValue(field, "Typed first");
    });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["%PDF"], "scan.pdf", { type: "application/pdf" });
    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await finishPdfImport();

    expect(field.value).toBe("Typed first");
    expect(container.textContent).toContain("This PDF has no selectable text.");
    expect(loadNotes()).toEqual([]);
  });
});
