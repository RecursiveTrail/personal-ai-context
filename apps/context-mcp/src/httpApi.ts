import { createServer, type ServerResponse } from "node:http";
import type { PackService } from "./packService.js";

const EMPTY_SEARCH_HINT = "Broaden query or drop shelf filter";

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

export function createHttpServer(service: PackService) {
  return createServer((request, response) => {
    try {
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }

      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname === "/health") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (url.pathname === "/shelves") {
        sendJson(response, 200, { shelves: service.listShelves() });
        return;
      }

      if (url.pathname === "/search") {
        const hits = service.searchContext(
          url.searchParams.get("q") ?? "",
          url.searchParams.get("shelf") ?? undefined
        );
        sendJson(
          response,
          200,
          hits.length === 0 ? { hits, hint: EMPTY_SEARCH_HINT } : { hits }
        );
        return;
      }

      if (url.pathname.startsWith("/notes/")) {
        const idOrPath = decodeURIComponent(url.pathname.slice("/notes/".length));
        const note = service.getNote(idOrPath);
        sendJson(
          response,
          note ? 200 : 404,
          note ?? { error: "Note not found" }
        );
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, 400, { error: (error as Error).message });
    }
  });
}
