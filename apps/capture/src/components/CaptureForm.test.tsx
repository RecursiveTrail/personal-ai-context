import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureForm } from "./CaptureForm.js";
import { SPEECH_UNSUPPORTED_MESSAGE } from "../lib/speech.js";
import { loadNotes } from "../store/notesStore.js";

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
});

describe("CaptureForm", () => {
  it("shows a fallback message when speech recognition is unavailable", () => {
    act(() => root.render(<CaptureForm onSaved={vi.fn()} />));

    expect(container.textContent).toContain(SPEECH_UNSUPPORTED_MESSAGE);
  });

  it("saves a typed note, clears the form, and notifies its parent", () => {
    const onSaved = vi.fn();
    act(() => root.render(<CaptureForm onSaved={onSaved} />));

    const title = container.querySelector<HTMLInputElement>("#capture-title")!;
    const shelf =
      container.querySelector<HTMLSelectElement>("#capture-shelf")!;
    const body = container.querySelector<HTMLTextAreaElement>("#capture-body")!;
    act(() => {
      setValue(title, "A useful preference");
      setValue(shelf, "preferences");
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
        shelf: "preferences",
        body: "Keep answers concise.",
      },
    ]);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(title.value).toBe("");
    expect(body.value).toBe("");
  });
});
