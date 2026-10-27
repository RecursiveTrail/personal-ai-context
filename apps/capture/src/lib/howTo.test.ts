import { describe, expect, it } from "vitest";
import { HOW_TO_FLOW, HOW_TO_POINTS, HOW_TO_SUMMARY } from "./howTo.js";

describe("how-to content", () => {
  it("keeps a short loop from capture to assistant", () => {
    expect(HOW_TO_SUMMARY).toContain("this browser");
    expect(HOW_TO_SUMMARY).toContain("assistants");
    expect(HOW_TO_FLOW.map((step) => step.label)).toEqual([
      "Capture",
      "Shelves",
      "Download pack",
      "Use in an assistant",
    ]);
    expect(HOW_TO_POINTS).toHaveLength(4);
    expect(HOW_TO_POINTS.join("\n")).toContain("Nothing is uploaded");
    expect(HOW_TO_POINTS.join("\n")).toContain("Install guide");
  });
});
