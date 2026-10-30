import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maybeSyncNotes } from "./companionSync.js";
import { loadNotes, replaceNotes } from "../store/notesStore.js";

const note = (id: string, body: string) => ({
  id,
  title: "T",
  shelf: "preferences",
  tags: [],
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-02-01T00:00:00.000Z",
  body,
  path: "preferences/t.md",
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("maybeSyncNotes", () => {
  it("returns offline and keeps local notes when companion is down", async () => {
    replaceNotes([note("note_local0000001", "local")]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(maybeSyncNotes()).resolves.toBe("offline");
    expect(loadNotes()).toHaveLength(1);
  });

  it("returns offline when /sync fails after healthy check", async () => {
    replaceNotes([note("note_local0000001", "local")]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
        .mockResolvedValueOnce({ ok: false, status: 500 })
    );
    await expect(maybeSyncNotes()).resolves.toBe("offline");
    expect(loadNotes()[0].body).toBe("local");
  });

  it("syncs local notes and replaces them with the server list", async () => {
    replaceNotes([note("note_local0000001", "local")]);
    const merged = [note("note_local0000001", "merged"), note("note_server000001", "s")];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, notes: 1 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notes: merged, applied: 1, kept_server: 0 }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await expect(maybeSyncNotes()).resolves.toBe("synced");
    expect(loadNotes()).toEqual(merged);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.notes).toHaveLength(1);
  });

  it("retries with notes written while the first sync response is pending", async () => {
    const initial = note("note_local0000001", "initial");
    const concurrent = note("note_local0000002", "concurrent");
    replaceNotes([initial]);

    let resolveFirstSync!: (response: Response) => void;
    const firstSync = new Promise<Response>((resolve) => {
      resolveFirstSync = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, notes: 1 }) })
      .mockReturnValueOnce(firstSync)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notes: [initial, concurrent], applied: 1, kept_server: 0 }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const syncing = maybeSyncNotes();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    replaceNotes([initial, concurrent]);
    resolveFirstSync(
      new Response(
        JSON.stringify({ notes: [initial], applied: 0, kept_server: 1 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    await expect(syncing).resolves.toBe("synced");
    expect(loadNotes()).toEqual([initial, concurrent]);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string).notes).toEqual([
      initial,
      concurrent,
    ]);
  });

  it("returns offline when the sync request times out", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, notes: 0 }) })
      .mockImplementationOnce((_url, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const syncing = maybeSyncNotes();
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(syncing).resolves.toBe("offline");
  });
});
