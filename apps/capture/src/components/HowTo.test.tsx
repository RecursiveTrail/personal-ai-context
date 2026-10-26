import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HowTo } from "./HowTo.js";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("HowTo", () => {
  it("lists the desk instructions and the install steps", () => {
    act(() => root.render(<HowTo />));

    expect(container.querySelector("#how-to-heading")?.textContent).toBe(
      "How to use Personal OS"
    );
    expect(container.textContent).toContain("Nothing here is uploaded.");
    expect(container.textContent).toContain("Audio files are not transcribed in this browser.");
    expect(container.textContent).toContain("Install the downloaded plugin");
    expect(container.textContent).toContain("Claude Code");
    expect(container.textContent).toContain(
      "Cloud chats and the Codex IDE extension do not run this server."
    );
    expect(container.querySelectorAll("ol").length).toBeGreaterThan(1);
  });
});
