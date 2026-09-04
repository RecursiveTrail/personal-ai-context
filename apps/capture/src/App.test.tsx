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
        .querySelector<HTMLFormElement>(".captureForm")!
        .dispatchEvent(
          new SubmitEvent("submit", { bubbles: true, cancelable: true })
        );
    });

    expect(
      container.querySelector<HTMLInputElement>(
        '.noteLibrary [aria-label="Title for Fresh capture"]'
      )?.value
    ).toBe("Fresh capture");
    expect(
      container.querySelector<HTMLTextAreaElement>(
        '.noteLibrary [aria-label="Body for Fresh capture"]'
      )?.value
    ).toBe("Saved locally");
  });
});
