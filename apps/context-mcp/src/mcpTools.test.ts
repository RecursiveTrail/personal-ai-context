import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createContextMcpServer } from "./mcpTools.js";
import { createPackService } from "./packService.js";

const packDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/personal-os"
);

describe("context MCP tools", () => {
  let client: Client;
  let server: ReturnType<typeof createContextMcpServer>;

  afterEach(async () => {
    await Promise.all([client.close(), server.close()]);
  });

  it("registers list_shelves, search_context, get_note, and reload_pack", async () => {
    await connect(await createPackService(packDir));
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "list_shelves",
      "search_context",
      "get_note",
      "reload_pack",
    ]);

    expect(await callJson("list_shelves", {})).toEqual([
      "ai-collaboration",
      "goals",
      "personal",
      "preferences",
      "routines",
      "work",
    ]);
    expect(
      (await callJson("search_context", {
        query: "concise",
        shelf: "preferences",
      }))[0].id
    ).toBe("note_pref_short");
    expect(
      (await callJson("get_note", { idOrPath: "note_pref_short" })).id
    ).toBe("note_pref_short");
  });

  it("reloads the pack after files change without recreating the service", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-reload-"));
    try {
      await fs.mkdir(path.join(dir, "preferences"));
      await fs.mkdir(path.join(dir, "work"));
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
      await connect(service);
      expect(await callJson("list_shelves", {})).toEqual(["preferences", "work"]);
      expect(await callJson("get_note", { idOrPath: "note_new" })).toBeNull();

      await fs.writeFile(
        path.join(dir, "work", "new-note.md"),
        `---
id: note_new
title: New work note
shelf: work
tags:
  - capture:text
created: 2026-09-04T11:00:00.000Z
updated: 2026-09-04T11:00:00.000Z
---

Fresh export.
`
      );

      expect(await callJson("reload_pack", {})).toEqual({
        ok: true,
        notes: 2,
        shelves: ["preferences", "work"],
      });
      expect(
        (await callJson("get_note", { idOrPath: "note_new" })).title
      ).toBe("New work note");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  async function connect(service: Awaited<ReturnType<typeof createPackService>>) {
    server = createContextMcpServer(service);
    client = new Client({ name: "context-mcp-test", version: "0.1.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  }

  async function callJson(
    name: string,
    args: Record<string, unknown>
  ): Promise<any> {
    const result = await client.callTool({ name, arguments: args });
    const content = (
      result as { content: Array<{ type: string; text?: string }> }
    ).content;
    const text = content.find((item) => item.type === "text");
    if (!text || text.type !== "text") throw new Error("Missing text result");
    return JSON.parse(text.text ?? "");
  }
});
