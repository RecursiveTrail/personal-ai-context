import type { McpConnectInfo } from "./tauriApi";

/** Cursor MCP settings JSON for this Chit install. */
export function cursorMcpSnippet(info: McpConnectInfo): string {
  return JSON.stringify(
    {
      mcpServers: {
        "personal-os": {
          command: info.mcpBinary,
          args: ["--pack", info.packPath],
        },
      },
    },
    null,
    2,
  );
}
