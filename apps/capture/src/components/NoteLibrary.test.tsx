import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteLibrary } from "./NoteLibrary.js";
import { loadNotes, saveNote } from "../store/notesStore.js";
import { loadShelves } from "../store/shelvesStore.js";

let container: HTMLDivElement;
let root: Root;

function setValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const prototype =
    element instanceof HTMLTextAreaElement
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
  it("shows note cards and saves an edit", () => {
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
        <NoteLibrary
          notes={[first, second]}
          shelves={loadShelves()}
          onChanged={onChanged}
        />
      )
    );

    expect(
      [...container.querySelectorAll("h3")].map((heading) => heading.textContent)
    ).toEqual(["Preference", "Goal"]);
    expect(container.textContent).toContain("Original");
    expect(container.textContent).toContain("Edited just now");

    act(() => {
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Edit"
      )!.click();
    });

    const title = container.querySelector<HTMLInputElement>(
      `[aria-label="Title for ${first.title}"]`
    )!;
    const body = container.querySelector<HTMLTextAreaElement>(
      `[aria-label="Body for ${first.title}"]`
    )!;
    act(() => {
      setValue(title, "Updated preference");
      setValue(body, "Updated body");
    });
    act(() => {
      title.closest("form")!.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true })
      );
    });

    expect(loadNotes().find((note) => note.id === first.id)).toMatchObject({
      title: "Updated preference",
      body: "Updated body",
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("moves a note onto another shelf", () => {
    const note = saveNote({
      title: "Preference",
      shelf: "preferences",
      body: "Original",
    });
    const onChanged = vi.fn();
    act(() =>
      root.render(
        <NoteLibrary notes={[note]} shelves={loadShelves()} onChanged={onChanged} />
      )
    );
    act(() => {
      [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Move shelf")
      )!.click();
    });
    act(() => {
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Routines"
      )!.click();
    });
    expect(loadNotes()[0]?.shelf).toBe("routines");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("requires confirmation before deleting a note", () => {
    const note = saveNote({
      title: "Keep or remove",
      shelf: "preferences",
      body: "Text",
    });
    const onChanged = vi.fn();
    act(() =>
      root.render(
        <NoteLibrary notes={[note]} shelves={loadShelves()} onChanged={onChanged} />
      )
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(`[aria-label="Delete ${note.title}"]`)!
        .click();
    });
    expect(container.textContent).toContain("Delete this note?");
    act(() => {
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Cancel"
      )!.click();
    });
    expect(loadNotes()).toHaveLength(1);

    act(() => {
      container
        .querySelector<HTMLButtonElement>(`[aria-label="Delete ${note.title}"]`)!
        .click();
    });
    act(() => {
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Delete Note"
      )!.click();
    });
    expect(loadNotes()).toHaveLength(0);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("labels an older note with its calendar date", () => {
    const note = saveNote({
      title: "Prefer short answers",
      shelf: "preferences",
      body: "I prefer concise bullet answers over long essays.",
    });
    note.updated = "2026-09-04T10:00:00.000Z";
    act(() =>
      root.render(
        <NoteLibrary notes={[note]} shelves={loadShelves()} onChanged={vi.fn()} />
      )
    );

    const expected = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(note.updated));
    expect(container.textContent).toContain(`Updated ${expected}`);
    expect(container.textContent).not.toContain("Edited just now");
  });
});