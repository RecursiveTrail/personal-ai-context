import { describe, expect, it } from "vitest";
import { parseShelves, serializeShelves, type PackShelf } from "./shelves.js";

const shelf: PackShelf = {
  slug: "preferences",
  name: "Preferences",
  description: "How you like things done.",
  color: "#0f6e6e",
  order: 1,
  isDefault: true,
};

describe("shelves file", () => {
  it("round-trips a shelf list", () => {
    const parsed = parseShelves(serializeShelves([shelf]));
    expect(parsed).toEqual([shelf]);
  });

  it("rejects an invalid file", () => {
    expect(() => parseShelves("{")).toThrow(/invalid shelves file/i);
    expect(() => parseShelves('{"version":1}')).toThrow(/invalid shelves file/i);
    expect(() =>
      parseShelves(
        JSON.stringify({
          version: 1,
          shelves: [{ ...shelf, color: "teal" }],
        })
      )
    ).toThrow(/invalid shelves file/i);
  });
});
