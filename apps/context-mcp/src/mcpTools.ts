import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PackService } from "./packService.js";

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

export function createContextMcpServer(service: PackService): McpServer {
  const server = new McpServer({
    name: "personal-os-context",
    version: "0.1.0",
  });

  server.registerTool(
    "list_shelves",
    {
      description: "List the shelves available in the personal context pack",
      annotations: readOnlyAnnotations,
    },
    async () => textResult(service.listShelves())
  );

  server.registerTool(
    "search_context",
    {
      description: "Search personal context notes, optionally within a shelf",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        shelf: z.string().optional().describe("Optional shelf filter"),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ query, shelf }) => textResult(service.searchContext(query, shelf))
  );

  server.registerTool(
    "get_note",
    {
      description: "Get a complete context note by its id or pack-relative path",
      inputSchema: z.object({
        idOrPath: z.string().describe("Note id or pack-relative path"),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ idOrPath }) => textResult(service.getNote(idOrPath) ?? null)
  );

  return server;
}
