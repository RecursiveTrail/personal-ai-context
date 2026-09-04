import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createContextMcpServer } from "./mcpTools.js";
import { createPackService } from "./packService.js";

const packDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/personal-os"
);

describe("context MCP tools", () => {
  let client: Client;
  let server: ReturnType<typeof createContextMcpServer>;

  beforeEach(async () => {
    server = createContextMcpServer(await createPackService(packDir));
    client = new Client({ name: "context-mcp-test", version: "0.1.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await Promise.all([client.close(), server.close()]);
  });

  it("registers list_shelves, search_context, and get_note", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "list_shelves",
      "search_context",
      "get_note",
    ]);

    expect(await callJson("list_shelves", {})).toContain("preferences");
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
