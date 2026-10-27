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
  it("shows a short summary and the capture-to-assistant flow", () => {
    act(() => root.render(<HowTo />));

    expect(container.querySelector("#how-to-heading")?.textContent).toBe(
      "How to use Personal OS"
    );
    expect(container.textContent).toContain("stays in this browser");
    expect(container.textContent).toContain("Capture");
    expect(container.textContent).toContain("Download pack");
    expect(container.textContent).toContain("Use in an assistant");
    expect(container.textContent).toContain("Install guide");
    expect(container.querySelectorAll(".howToFlowStep").length).toBe(4);
  });
});
