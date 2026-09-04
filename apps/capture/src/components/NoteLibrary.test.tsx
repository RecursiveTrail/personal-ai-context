import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteLibrary } from "./NoteLibrary.js";
import { loadNotes, saveNote } from "../store/notesStore.js";

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

describe("NoteLibrary", () => {
  it("groups notes by shelf and saves edits", () => {
    const first = saveNote({
      title: "Preference",
      shelf: "preferences",
      body: "Original",
    });
    const second = saveNote({
      title: "Goal",
      shelf: "goals",
      body: "Ship it",
    });
    const onChanged = vi.fn();
    act(() =>
      root.render(
        <NoteLibrary notes={[first, second]} onChanged={onChanged} />
      )
    );

    expect(
      [...container.querySelectorAll("h3")].map((heading) => heading.textContent)
    ).toEqual(["preferences", "goals"]);

    const title = container.querySelector<HTMLInputElement>(
      `[aria-label="Title for ${first.title}"]`
    )!;
    const shelf = container.querySelector<HTMLSelectElement>(
      `[aria-label="Shelf for ${first.title}"]`
    )!;
    const body = container.querySelector<HTMLTextAreaElement>(
      `[aria-label="Body for ${first.title}"]`
    )!;
    act(() => {
      setValue(title, "Updated preference");
      setValue(shelf, "routines");
      setValue(body, "Updated body");
    });
    expect(
      container.querySelector<HTMLInputElement>(
        '[aria-label="Title for Updated preference"]'
      )
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLSelectElement>(
        '[aria-label="Shelf for Updated preference"]'
      )
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLTextAreaElement>(
        '[aria-label="Body for Updated preference"]'
      )
    ).not.toBeNull();
    act(() => {
      title
        .closest("form")!
        .dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true })
        );
    });

    expect(loadNotes().find((note) => note.id === first.id)).toMatchObject({
      title: "Updated preference",
      shelf: "routines",
      body: "Updated body",
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("requires confirmation before deleting a note", () => {
    const note = saveNote({
      title: "Keep or remove",
      shelf: "preferences",
      body: "Text",
    });
    const onChanged = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => root.render(<NoteLibrary notes={[note]} onChanged={onChanged} />));

    const deleteButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Delete"
    )!;
    act(() => deleteButton.click());
    expect(loadNotes()).toHaveLength(1);

    confirm.mockReturnValue(true);
    act(() => deleteButton.click());
    expect(loadNotes()).toHaveLength(0);
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
