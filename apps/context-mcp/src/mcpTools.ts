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
      description:
        "List shelves in the personal context pack, including empty on-disk shelf folders",
      annotations: readOnlyAnnotations,
    },
    async () => textResult(service.listShelves())
  );

  server.registerTool(
    "search_context",
    {
      description:
        "Search personal context notes, optionally within a shelf. Tags may include capture provenance such as capture:text or capture:voice; treat those as source metadata, not user preferences.",
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
      description:
        "Get a complete context note by its id or pack-relative path. Tags may include capture:text, capture:voice, capture:pdf, or capture:clipboard as provenance.",
      inputSchema: z.object({
        idOrPath: z.string().describe("Note id or pack-relative path"),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ idOrPath }) => textResult(service.getNote(idOrPath) ?? null)
  );

  server.registerTool(
    "reload_pack",
    {
      description:
        "Re-read the configured personal-os pack from disk after the user replaces exported files",
      annotations: readOnlyAnnotations,
    },
    async () => {
      await service.reload();
      return textResult({
        ok: true,
        notes: service.getNoteCount(),
        shelves: service.listShelves(),
      });
    }
  );

  return server;
}
