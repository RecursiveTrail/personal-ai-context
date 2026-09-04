import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildPackZip } from "./exportZip.js";
import type { Note } from "@personal-os/pack-core";

const notes: Note[] = [
  {
    id: "note_abc123def456",
    title: "Prefer short answers",
    shelf: "preferences",
    tags: [],
    created: "2026-09-04T00:00:00.000Z",
    updated: "2026-09-04T00:00:00.000Z",
    body: "Be concise.",
    path: "preferences/prefer-short-answers.md",
  },
];

describe("buildPackZip", () => {
  it("includes note markdown and manifest under personal-os/", async () => {
    const blob = await buildPackZip(notes);
    const zip = await JSZip.loadAsync(blob);
    const md = await zip
      .file("personal-os/preferences/prefer-short-answers.md")!
      .async("string");
    expect(md).toContain("note_");
    expect(md).toContain("Be concise.");
    const manifest = JSON.parse(
      await zip.file("personal-os/_meta/manifest.json")!.async("string")
    );
    expect(manifest.version).toBe(1);
    expect(manifest.notes).toHaveLength(1);
  });
});
