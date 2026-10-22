import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { Note, PackShelf } from "@personal-os/pack-core";
import { buildPluginZip } from "./exportZip.js";

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

const shelves: PackShelf[] = [
  {
    slug: "preferences",
    name: "Preferences",
    description: "How you like things done.",
    color: "#0f6e6e",
    order: 1,
    isDefault: true,
  },
  {
    slug: "goals",
    name: "Goals",
    description: "",
    color: "#8f2d2d",
    order: 2,
    isDefault: true,
  },
];

describe("buildPluginZip", () => {
  it("wraps the pack, server, and plugin files", async () => {
    const zip = await JSZip.loadAsync(await buildPluginZip(notes, shelves, "console.log('server')\n"));
    const root = "personal-os-plugin";
    const markdown = await zip.file(`${root}/plugin/personal-os/preferences/prefer-short-answers.md`)!.async("string");
    expect(markdown).toContain("Be concise.");
    const manifest = JSON.parse(await zip.file(`${root}/plugin/personal-os/_meta/manifest.json`)!.async("string"));
    expect(manifest.version).toBe(1);
    const shelfFile = JSON.parse(await zip.file(`${root}/plugin/personal-os/_meta/shelves.json`)!.async("string"));
    expect(shelfFile.shelves.find((shelf: PackShelf) => shelf.slug === "goals").description).toBe("goals");
    expect(await zip.file(`${root}/plugin/personal-os/goals/.keep`)!.async("string")).toBe("");
    expect(await zip.file(`${root}/plugin/server/server.js`)!.async("string")).toContain("server");
    expect(zip.file(`${root}/INSTALL.md`)).not.toBeNull();
    expect(zip.file(`${root}/plugin/mcp.json`)).not.toBeNull();
    expect(zip.file(`${root}/.claude-plugin/marketplace.json`)).not.toBeNull();
    expect(zip.file(`${root}/.agents/plugins/marketplace.json`)).not.toBeNull();
  });

  it("rejects a missing server", async () => {
    await expect(buildPluginZip(notes, shelves, "  ")).rejects.toThrow("Bundled server is missing");
  });
});
