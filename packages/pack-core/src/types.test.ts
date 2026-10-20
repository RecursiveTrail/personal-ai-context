import { describe, it, expect } from "vitest";
import { DEFAULT_SHELVES, META_DIR } from "./types.js";

describe("DEFAULT_SHELVES", () => {
  it("includes the default Personal OS shelves", () => {
    expect(DEFAULT_SHELVES).toEqual([
      "preferences",
      "routines",
      "ai-collaboration",
      "goals",
      "work",
      "personal",
    ]);
  });

  it("uses _meta as meta dir name", () => {
    expect(META_DIR).toBe("_meta");
  });
});
