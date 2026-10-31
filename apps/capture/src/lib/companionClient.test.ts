import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteNoteOnCompanion,
  fetchCompanionHealth,
  syncNotesWithCompanion,
} from "./companionClient.js";

afterEach(() => vi.unstubAllGlobals());

const serverNotes = [
  {
    id: "note_abc123456789",
    title: "T",
    shelf: "preferences",
    tags: [],
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-02-01T00:00:00.000Z",
    body: "b",
    path: "preferences/t.md",
  },
];

describe("companionClient", () => {
  it("rejects when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(fetchCompanionHealth()).rejects.toThrow();
  });

  it("reads health from /health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, notes: 3 }) })
    );
    await expect(fetchCompanionHealth()).resolves.toEqual({ ok: true, notes: 3 });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8787/health", expect.anything());
  });

  it("rejects on non-ok health response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchCompanionHealth()).rejects.toThrow();
  });

  it("posts notes to /sync and returns server list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ notes: serverNotes, applied: 1, kept_server: 0 }),
      })
    );
    const out = await syncNotesWithCompanion([]);
    expect(out).toEqual(serverNotes);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/sync",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ notes: [] }) })
    );
  });

  it("rejects when /sync fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(syncNotesWithCompanion([])).rejects.toThrow();
  });

  it("deletes on the companion and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await expect(deleteNoteOnCompanion("note_a/b")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/notes/note_a%2Fb",
      expect.objectContaining({ method: "DELETE" })
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(deleteNoteOnCompanion("x")).resolves.toBe(false);
  });
});
