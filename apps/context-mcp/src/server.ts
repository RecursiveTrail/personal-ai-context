#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolvePackPath, resolvePort } from "./config.js";
import { createHttpServer } from "./httpApi.js";
import { createContextMcpServer } from "./mcpTools.js";
import { createPackService } from "./packService.js";

async function main(): Promise<void> {
  const service = await createPackService(resolvePackPath());
  for (const error of service.getLoadErrors()) {
    console.error(`Pack load error: ${error}`);
  }

  if (process.argv.includes("--http")) {
    const port = resolvePort();
    const httpServer = createHttpServer(service);
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, "127.0.0.1", () => {
        httpServer.off("error", reject);
        console.error(
          `Personal OS HTTP API listening on http://127.0.0.1:${port}`
        );
        resolve();
      });
    });
  }

  const mcpServer = createContextMcpServer(service);
  await mcpServer.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
