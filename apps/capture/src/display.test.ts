import { describe, expect, it } from "vitest";
import {
  byteSize,
  captureTag,
  quickNoteTitle,
  shelfStatusLine,
  splitCaptureTag,
  wordCount,
} from "./display.js";

describe("desk display helpers", () => {
  it("derives a title from the first line", () => {
    expect(quickNoteTitle("Prefer short answers\nMore detail")).toBe(
      "Prefer short answers"
    );
    expect(quickNoteTitle("  ")).toBe("Note");
    expect(quickNoteTitle("a".repeat(90)).endsWith("…")).toBe(true);
    expect(quickNoteTitle("a".repeat(90)).length).toBeLessThanOrEqual(80);
  });

  it("counts words and bytes and hides the capture tag", () => {
    expect(wordCount("  one   two ")).toBe(2);
    expect(byteSize("ab")).toBe(2);
    expect(splitCaptureTag([captureTag("voice"), "tone"])).toEqual({
      source: "voice",
      tags: ["tone"],
    });
  });

  it("summarizes an empty shelf and a shelf updated today", () => {
    expect(shelfStatusLine([])).toBe("0 notes · No updates · 0 words");
    const now = new Date(2026, 9, 18, 15, 0, 0);
    const updated = new Date(2026, 9, 18, 9, 0, 0).toISOString();
    expect(shelfStatusLine([{ body: "one two", updated }], now)).toBe(
      "1 note · Updated today · 2 words"
    );
  });
});