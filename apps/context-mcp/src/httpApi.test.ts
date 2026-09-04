import type { AddressInfo } from "node:net";
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
    expect((await fetchJson("/shelves")).shelves).toContain("preferences");
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
    expect(await fetchJson("/search?q=does-not-exist")).toEqual({
      hits: [],
      hint: "Broaden query or drop shelf filter",
    });

    const response = await fetch(`${baseUrl}/notes/missing`);
    expect(response.status).toBe(404);
  });

  async function fetchJson(route: string): Promise<any> {
    const response = await fetch(`${baseUrl}${route}`);
    expect(response.status).toBe(200);
    return response.json();
  }
});
