import { describe, expect, it } from "vitest";
import { HOW_TO_SECTIONS } from "./howTo.js";

function steps(): string {
  return HOW_TO_SECTIONS.flatMap((section) => section.steps).join("\n");
}

describe("HOW_TO_SECTIONS", () => {
  it("states the local-only rules in the order a person uses the desk", () => {
    expect(HOW_TO_SECTIONS.map((section) => section.title)).toEqual([
      "What this desk stores",
      "Move around",
      "Save a note on a shelf",
      "Capture from the desk",
      "Dictate",
      "Add a PDF or text file",
      "Clean a note with an LLM",
      "Read the ledger",
      "Change a note",
      "Organize shelves",
      "Choose light or dark",
      "Download a pack and bring it back",
      "Clear this browser",
    ]);
    const text = steps();
    expect(text).toContain("Nothing here is uploaded.");
    expect(text).toContain("Audio files are not transcribed in this browser.");
    expect(text).toContain("Press Enter to save. Shift+Enter starts a new line.");
    expect(text).toContain("Clear ledger deletes notes and custom shelves.");
    expect(text).toContain("It leaves LLM settings and the color mode.");
    expect(text).toContain("Preferences, Routines, AI collaboration, Goals, Work, and Personal");
  });
});
