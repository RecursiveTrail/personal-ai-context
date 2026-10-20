import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer } from "./httpApi.js";
import { createPackService } from "./packService.js";

const packDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/personal-os"
);

describe("HTTP API", () => {
  let baseUrl: string;
  let server: ReturnType<typeof createHttpServer>;

  beforeEach(async () => {
    server = createHttpServer(await createPackService(packDir));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it("serves health, shelves, search, and notes", async () => {
    expect(await fetchJson("/health")).toEqual({ ok: true });
    expect((await fetchJson("/shelves")).shelves).toEqual([
      "ai-collaboration",
      "goals",
      "personal",
      "preferences",
      "routines",
      "work",
    ]);
    expect(
      (await fetchJson("/search?q=concise&shelf=preferences")).hits[0].id
    ).toBe("note_pref_short");
    expect((await fetchJson("/notes/note_pref_short")).id).toBe(
      "note_pref_short"
    );
    expect(
      (
        await fetchJson(
          "/notes/preferences%2Fprefer-short-answers.md"
        )
      ).id
    ).toBe("note_pref_short");
  });

  it("returns a hint for empty search results and 404 for missing notes", async () => {
    expect(await fetchJson("/search?q=zzzxxyyqq")).toEqual({
      hits: [],
      hint: "Broaden query or drop shelf filter",
    });

    const response = await fetch(`${baseUrl}/notes/missing`);
    expect(response.status).toBe(404);
  });

  it("reloads the pack over POST /reload", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "http-reload-"));
    let localServer: ReturnType<typeof createHttpServer> | undefined;
    try {
      await fs.mkdir(path.join(dir, "preferences"));
      await fs.writeFile(
        path.join(dir, "preferences", "seed.md"),
        `---
id: note_seed
title: Seed
shelf: preferences
tags: []
created: 2026-09-04T10:00:00.000Z
updated: 2026-09-04T10:00:00.000Z
---

Seed body.
`
      );

      const service = await createPackService(dir);
      localServer = createHttpServer(service);
      await new Promise<void>((resolve) =>
        localServer!.listen(0, "127.0.0.1", resolve)
      );
      const address = localServer.address() as AddressInfo;
      const localBase = `http://127.0.0.1:${address.port}`;

      await fs.mkdir(path.join(dir, "personal"));
      await fs.writeFile(
        path.join(dir, "personal", "fresh.md"),
        `---
id: note_fresh
title: Fresh
shelf: personal
tags: []
created: 2026-09-04T12:00:00.000Z
updated: 2026-09-04T12:00:00.000Z
---

After reload.
`
      );

      const response = await fetch(`${localBase}/reload`, { method: "POST" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        notes: 2,
        shelves: ["personal", "preferences"],
      });
    } finally {
      if (localServer) {
        await new Promise<void>((resolve, reject) =>
          localServer!.close((error) => (error ? reject(error) : resolve()))
        );
      }
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function fetchJson(route: string): Promise<any> {
    const response = await fetch(`${baseUrl}${route}`);
    expect(response.status).toBe(200);
    return response.json();
  }
});
