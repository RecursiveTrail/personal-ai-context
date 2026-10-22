export const PLUGIN_ZIP_ROOT = "personal-os-plugin";
export const PLUGIN_ZIP_NAME = "personal-os-plugin.zip";

const serverArgs = (rootVar: string) => [
  `${rootVar}/server/server.js`,
  "--pack",
  `${rootVar}/personal-os`,
];

function mcpConfig(rootVar: string, stdio: boolean): string {
  const server: Record<string, unknown> = {
    command: "node",
    args: serverArgs(rootVar),
  };
  if (stdio) server.type = "stdio";
  const file: Record<string, unknown> = {
    mcpServers: { "personal-os": server },
  };
  if (stdio) {
    file.$schema = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
  }
  return JSON.stringify(file, null, 2);
}

export const INSTALL_STEPS = [
  {
    title: "Unzip the download",
    body: "Unzip personal-os-plugin.zip. The outer folder is personal-os-plugin. The plugin itself is the inner plugin folder.",
  },
  {
    title: "Install Node.js 20 or newer",
    body: "Install Node.js 20 or newer on the computer that runs the assistant.",
  },
  {
    title: "Claude Code",
    body: "From a shell, run claude plugin marketplace add /absolute/path/to/personal-os-plugin, then claude plugin install personal-os@personal-os. Start a new session and ask it to search your notes.",
  },
  {
    title: "Cursor",
    body: "Copy the inner plugin folder to ~/.cursor/plugins/local/personal-os, so .cursor-plugin/plugin.json is directly inside that folder. Reload the window. Local plugin imports must be allowed.",
  },
  {
    title: "Codex and ChatGPT desktop",
    body: "Run codex plugin marketplace add /absolute/path/to/personal-os-plugin, then install Personal OS from that marketplace in the ChatGPT desktop app or Codex CLI. Use a local thread. Cloud chats and the Codex IDE extension do not run this server.",
  },
];

export function installGuideMarkdown(): string {
  return [
    "# Install Personal OS",
    "",
    ...INSTALL_STEPS.flatMap((step) => [`## ${step.title}`, "", step.body, ""]),
  ].join("\n");
}

const skill = `---
name: use-personal-context
description: Search the user's Personal OS notes for preferences, routines, goals, and collaboration rules before answering from personal context.
---

When a task depends on this user's preferences, routines, goals, or collaboration rules, use the personal-os MCP tools in this order:

1. list_shelves
2. search_context with a query and an optional shelf
3. get_note with an id or a pack-relative path

Quote only the note that applies. Treat tags that start with capture: as provenance.
`;

export function pluginFileEntries(): { path: string; text: string }[] {
  return [
    {
      path: "plugin/.claude-plugin/plugin.json",
      text: JSON.stringify(
        {
          name: "personal-os",
          version: "1.0.0",
          description: "Personal context notes for this user, served by a local MCP server.",
        },
        null,
        2
      ),
    },
    { path: "plugin/.mcp.json", text: mcpConfig("${CLAUDE_PLUGIN_ROOT}", false) },
    {
      path: "plugin/.cursor-plugin/plugin.json",
      text: JSON.stringify(
        {
          name: "personal-os",
          version: "1.0.0",
          description: "Personal context notes for this user, served by a local MCP server.",
          mcpServers: "./cursor-mcp.json",
        },
        null,
        2
      ),
    },
    { path: "plugin/cursor-mcp.json", text: mcpConfig("${CURSOR_PLUGIN_ROOT}", false) },
    {
      path: "plugin/plugin.json",
      text: JSON.stringify(
        {
          $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
          name: "personal-os",
          version: "1.0.0",
          description: "Personal context notes for this user, served by a local MCP server.",
        },
        null,
        2
      ),
    },
    { path: "plugin/mcp.json", text: mcpConfig("${PLUGIN_ROOT}", true) },
    { path: "plugin/skills/use-personal-context/SKILL.md", text: skill },
    {
      path: ".claude-plugin/marketplace.json",
      text: JSON.stringify(
        {
          name: "personal-os",
          owner: { name: "Personal OS" },
          plugins: [
            {
              name: "personal-os",
              source: "./plugin",
              description: "Personal context notes with a local MCP server",
            },
          ],
        },
        null,
        2
      ),
    },
    {
      path: ".agents/plugins/marketplace.json",
      text: JSON.stringify(
        {
          name: "personal-os",
          interface: { displayName: "Personal OS" },
          plugins: [
            {
              name: "personal-os",
              source: { source: "local", path: "./plugin" },
              policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
              category: "Productivity",
            },
          ],
        },
        null,
        2
      ),
    },
    { path: "INSTALL.md", text: installGuideMarkdown() },
  ];
}
