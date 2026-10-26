import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { serializeNote } from "@personal-os/pack-core";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App.js";
import { loadNotes } from "./store/notesStore.js";

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
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.location.hash = "";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.location.hash = "";
  delete document.documentElement.dataset.theme;
});

describe("App", () => {
  it("keeps the selected color mode for the next visit", () => {
    act(() => root.render(<App />));
    const toggle = () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Dark mode"]')!;

    expect(toggle().getAttribute("role")).toBe("switch");
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(toggle().textContent?.trim()).toBe("");
    expect(document.documentElement.dataset.theme).not.toBe("dark");

    act(() => toggle().click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(toggle().getAttribute("aria-label")).toBe("Dark mode");
    expect(localStorage.getItem("personal-os.settings.v1")).toContain('"theme":"dark"');

    act(() => root.unmount());
    act(() => {
      root = createRoot(container);
      root.render(<App />);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("opens a shelf and saves a quick note into the pack", () => {
    act(() => root.render(<App />));

    expect(container.querySelector("h1")?.textContent).toBe("Personal OS");
    expect(container.textContent).toContain("Saved in this browser");
    expect(container.textContent).toContain("Preferences");
    expect(container.textContent).toContain("AI collaboration");
    expect(container.textContent).toContain("No telemetry");

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-shelf="preferences"]')!
        .click();
    });

    const field = container.querySelector<HTMLTextAreaElement>("#quick-note")!;
    expect(field.placeholder).toContain("Preferences");
    act(() => {
      setValue(field, "Prefer short answers");
    });
    act(() => {
      field.closest("form")!.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true })
      );
    });

    expect(container.textContent).toContain("Prefer short answers");
    expect(loadNotes()[0]).toMatchObject({
      title: "Prefer short answers",
      shelf: "preferences",
      body: "Prefer short answers",
      tags: ["capture:text"],
    });
    expect(field.value).toBe("");
    expect(container.textContent).toContain(
      "Drop a PDF or text file, or paste text, to append to Preferences."
    );
    expect(container.textContent).toContain(
      "Supports .pdf and plain text. Dictation stays in this browser."
    );
    expect(container.textContent).not.toMatch(/\.m4a|\.mp3|audio recordings/i);
  });

  it("returns to the desk when the brand is clicked", () => {
    window.location.hash = "#/shelf/personal";
    act(() => root.render(<App />));
    expect(container.textContent).toContain("Add note to shelf");

    act(() => {
      container.querySelector<HTMLButtonElement>(".brandHome")!.click();
    });

    expect(window.location.hash).toBe("#/");
    expect(container.textContent).toContain("Quick capture");
    expect(container.textContent).not.toContain("Add note to shelf");
  });

  it("offers PDF and text upload on the desk, not audio files", () => {
    act(() => root.render(<App />));
    const input = [...container.querySelectorAll<HTMLInputElement>('input[type="file"]')].find(
      (candidate) => candidate.closest("label")?.textContent?.includes("Upload PDF")
    )!;
    expect(input.accept).toContain(".pdf");
    expect(input.accept).toContain(".txt");
    expect(input.accept).not.toMatch(/audio|m4a|mp3/i);
  });

  function openLlmSettings() {
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Desk menu"]')!
        .click();
    });
    act(() => {
      [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("LLM settings")
      )!.click();
    });
  }

  it("closes LLM settings from the dismiss button and after saving", () => {
    act(() => root.render(<App />));
    openLlmSettings();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    openLlmSettings();
    act(() => {
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Save settings"
      )!.click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("opens the ledger and audio capture from the header", () => {
    act(() => root.render(<App />));

    act(() => {
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Ledger"
      )!.click();
    });
    expect(container.querySelector("#ledger-heading")?.textContent).toBe("Ledger");

    act(() => {
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Audio Capture"
      )!.click();
    });
    expect(container.querySelector("#audio-heading")?.textContent).toBe(
      "Audio Capture"
    );
    expect(container.querySelector("#audio-transcript")).not.toBeNull();

    act(() => {
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Desk"
      )!.click();
    });
    expect(container.textContent).toContain("Quick capture");
  });

  it("shows the pack download in the desk menu", () => {
    act(() => root.render(<App />));
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Desk menu"]')!
        .click();
    });
    expect(container.textContent).toContain("Download pack");
    expect(container.textContent).toContain("Downloads personal-os-plugin.zip");
  });

  it("opens the how-to page from the top bar and the desk menu", () => {
    act(() => root.render(<App />));

    const howTo = () =>
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "How to use"
      )!;

    act(() => howTo().click());
    expect(window.location.hash).toBe("#/guide");
    expect(container.querySelector("#how-to-heading")?.textContent).toBe(
      "How to use Personal OS"
    );
    expect(howTo().getAttribute("aria-current")).toBe("page");

    act(() => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Desk")!
        .click();
    });
    expect(window.location.hash).toBe("#/");
    expect(container.querySelector("#how-to-heading")).toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Desk menu"]')!
        .click();
    });
    const menuItem = [...container.querySelectorAll('[role="menuitem"]')].find(
      (button) => button.textContent?.includes("Instructions for this desk")
    )!;
    act(() => (menuItem as HTMLButtonElement).click());
    expect(window.location.hash).toBe("#/guide");
    expect(container.textContent).toContain("Install the downloaded plugin");
  });

  it("opens the install guide and previews an import", async () => {
    act(() => root.render(<App />));
    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Desk menu"]')!.click();
    });
    act(() => {
      [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Install guide")
      )!.click();
    });
    expect(container.textContent).toContain("Claude Code");
    expect(container.textContent).toContain("Cursor");
    expect(container.textContent).toContain("Codex and ChatGPT desktop");

    const zip = new JSZip();
    zip.file(
      "personal-os/preferences/fresh.md",
      serializeNote({
        id: "note_imported",
        title: "Imported note",
        shelf: "preferences",
        tags: [],
        created: "2026-09-04T00:00:00.000Z",
        updated: "2026-09-04T00:00:00.000Z",
        body: "From the plugin.",
        path: "preferences/fresh.md",
      })
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([bytes], "personal-os.zip", { type: "application/zip" });
    // jsdom's File has no arrayBuffer(); real browsers do.
    Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitForText("Added");
    expect(container.textContent).toContain("Added");
    expect(container.textContent).toContain("1");

    act(() => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel")!.click();
    });
    expect(loadNotes()).toHaveLength(0);

    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitForText("Confirm merge");
    await act(async () => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Confirm merge")!.click();
    });
    expect(loadNotes().map((item) => item.id)).toEqual(["note_imported"]);
  });
});
