import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App.js";

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
});

describe("App", () => {
  it("reloads the library after a note is captured", () => {
    act(() => root.render(<App />));

    expect(container.querySelector("h1")?.textContent).toBe("Personal OS");
    expect(container.textContent).toContain("Saved in this browser");
    expect(container.textContent).toContain("Downloads personal-os.zip");
    expect(container.textContent).toContain("No notes yet");

    act(() => {
      setValue(
        container.querySelector<HTMLInputElement>("#capture-title")!,
        "Fresh capture"
      );
      setValue(
        container.querySelector<HTMLTextAreaElement>("#capture-body")!,
        "Saved locally"
      );
    });
    act(() => {
      container
        .querySelector("#capture-title")!
        .closest("form")!
        .dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true })
        );
    });

    const library = container.querySelector(".noteLibrary")!;
    expect(library.textContent).toContain("Fresh capture");
    expect(library.textContent).toContain("Saved locally");
    expect(library.textContent).toContain("Preferences");
    expect(
      container.querySelector<HTMLInputElement>("#capture-title")?.value
    ).toBe("");
    expect(
      container.querySelector<HTMLTextAreaElement>("#capture-body")?.value
    ).toBe("");
  });
});
