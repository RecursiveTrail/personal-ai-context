import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LedgerView } from "./LedgerView.js";
import { loadNotes, saveNote } from "../store/notesStore.js";
import { loadShelves } from "../store/shelvesStore.js";

let container: HTMLDivElement;
let root: Root;

function renderLedger(
  notes = loadNotes(),
  handlers: {
    onOpenShelf?: (slug: string) => void;
    onChanged?: () => void;
    onDownload?: () => void;
    onCreateShelf?: () => void;
  } = {}
) {
  const onOpenShelf = handlers.onOpenShelf ?? vi.fn();
  const onChanged = handlers.onChanged ?? vi.fn();
  const onDownload = handlers.onDownload ?? vi.fn();
  const onCreateShelf = handlers.onCreateShelf ?? vi.fn();
  act(() => {
    root.render(
      <LedgerView
        notes={notes}
        shelves={loadShelves()}
        onOpenShelf={onOpenShelf}
        onChanged={onChanged}
        onDownload={onDownload}
        onCreateShelf={onCreateShelf}
      />
    );
  });
  return { onOpenShelf, onChanged, onDownload, onCreateShelf };
}

function setValue(element: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
    element,
    value
  );
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickButton(label: string) {
  const button = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(label)
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  act(() => button.click());
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("LedgerView", () => {
  it("catalogs every shelf and an empty state for shelves without notes", () => {
    renderLedger();

    expect(container.querySelector("#ledger-heading")?.textContent).toBe("Ledger");
    expect(container.textContent).toContain("0 entries cataloged across 6 distinct shelves");
    expect(container.textContent).toContain("Saved in this browser");
    expect(container.textContent).toContain("Preferences");
    expect(container.textContent).toContain("Personal");
    expect(container.textContent).toContain("No notes yet");
    expect(container.textContent).toContain("Shelf I");
    expect(container.textContent).not.toMatch(/indexeddb|encrypted|synced/i);
  });

  it("shows a saved note and opens its shelf", () => {
    saveNote({
      title: "Prefer short answers",
      shelf: "preferences",
      body: "Keep answers concise.",
      tags: ["tone"],
    });
    const { onOpenShelf } = renderLedger();

    expect(container.textContent).toContain("1 entry cataloged across 6 distinct shelves");
    expect(container.textContent).toContain("Prefer short answers");
    expect(container.textContent).toContain("Keep answers concise.");
    expect(container.textContent).toContain("1 entry");
    expect(container.textContent).toContain("#tone");

    clickButton("Open shelf");
    expect(onOpenShelf).toHaveBeenCalledWith("preferences");
  });

  it("filters by search, populated shelves, and empty shelves", () => {
    saveNote({
      title: "Prefer short answers",
      shelf: "preferences",
      body: "Keep answers concise.",
    });
    renderLedger();

    const search = container.querySelector<HTMLInputElement>("#ledger-search")!;
    act(() => setValue(search, "concise"));
    expect(container.textContent).toContain("Prefer short answers");
    expect(container.textContent).not.toContain("AI collaboration");

    act(() => setValue(search, ""));
    clickButton("Populated");
    expect(container.textContent).toContain("Prefer short answers");
    expect(container.textContent).not.toContain("AI collaboration");

    clickButton("Empty");
    expect(container.textContent).not.toContain("Prefer short answers");
    expect(container.textContent).toContain("AI collaboration");
  });

  it("limits recent edits to shelves touched in the last week", () => {
    const fresh = saveNote({
      title: "Fresh preference",
      shelf: "preferences",
      body: "New.",
    });
    const stale = saveNote({
      title: "Old goal",
      shelf: "goals",
      body: "Old.",
    });
    stale.updated = "2020-01-01T00:00:00.000Z";
    const notes = loadNotes().map((note) => (note.id === stale.id ? stale : note));
    expect(notes.some((note) => note.id === fresh.id)).toBe(true);
    renderLedger(notes);

    clickButton("Recent edits");
    expect(container.textContent).toContain("Fresh preference");
    expect(container.textContent).not.toContain("Old goal");
  });

  it("copies and deletes a note from the ledger", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    saveNote({
      title: "Prefer short answers",
      shelf: "preferences",
      body: "Keep answers concise.",
    });
    const onChanged = vi.fn();
    renderLedger(loadNotes(), { onChanged });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Copy Prefer short answers"]')!
        .click();
    });
    expect(writeText).toHaveBeenCalledWith("Prefer short answers\n\nKeep answers concise.");
    expect(container.textContent).toContain("Copied.");

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Delete Prefer short answers"]')!
        .click();
    });
    act(() => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Delete Note")!.click();
    });
    expect(loadNotes()).toEqual([]);
    expect(onChanged).toHaveBeenCalled();
  });

  it("focuses search from the keyboard shortcut and starts a new shelf", () => {
    const { onCreateShelf, onDownload } = renderLedger();
    const search = container.querySelector<HTMLInputElement>("#ledger-search")!;
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
    });
    expect(document.activeElement).toBe(search);

    clickButton("New shelf");
    expect(onCreateShelf).toHaveBeenCalledOnce();
    clickButton("Download pack");
    expect(onDownload).toHaveBeenCalledOnce();
  });
});
