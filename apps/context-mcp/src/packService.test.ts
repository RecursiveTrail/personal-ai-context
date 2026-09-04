import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createPackService } from "./packService.js";

const packDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/personal-os"
);

describe("createPackService", () => {
  it("lists shelves, searches, and gets notes by id or path", async () => {
    const service = await createPackService(packDir);

    expect(service.listShelves()).toContain("preferences");
    expect(service.searchContext("concise", "preferences")[0]?.title).toMatch(
      /short/i
    );
    expect(service.getNote("note_pref_short")?.body).toMatch(/concise/i);
    expect(
      service.getNote("preferences/prefer-short-answers.md")?.id
    ).toBe("note_pref_short");
  });
});
