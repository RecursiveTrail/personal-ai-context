import { beforeEach, describe, expect, it } from "vitest";
import { applyColorMode } from "./theme.js";

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#fff8f5" />';
  delete document.documentElement.dataset.theme;
});

describe("applyColorMode", () => {
  it("marks the document and the browser chrome", () => {
    applyColorMode("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#1c1917"
    );

    applyColorMode("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#fff8f5"
    );
  });
});
