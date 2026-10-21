import { describe, expect, it } from "vitest";
import {
  INSTALL_STEPS,
  installGuideMarkdown,
  pluginFileEntries,
} from "./pluginFiles.js";

describe("plugin files", () => {
  it("points each host at its own plugin root variable", () => {
    const files = new Map(pluginFileEntries().map((entry) => [entry.path, entry.text]));
    expect(files.get("plugin/.mcp.json")).toContain("${CLAUDE_PLUGIN_ROOT}/server/server.js");
    expect(files.get("plugin/.mcp.json")).toContain("${CLAUDE_PLUGIN_ROOT}/personal-os");
    expect(files.get("plugin/cursor-mcp.json")).toContain("${CURSOR_PLUGIN_ROOT}/server/server.js");
    expect(files.get("plugin/.cursor-plugin/plugin.json")).toContain("./cursor-mcp.json");
    expect(files.get("plugin/mcp.json")).toContain('"type": "stdio"');
    expect(files.get("plugin/mcp.json")).toContain("${PLUGIN_ROOT}/server/server.js");
    expect(files.get("plugin/plugin.json")).toContain("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(files.get("plugin/skills/use-personal-context/SKILL.md")).toContain("list_shelves");
    expect(files.get("plugin/skills/use-personal-context/SKILL.md")).toContain("search_context");
    expect(files.get("plugin/skills/use-personal-context/SKILL.md")).toContain("get_note");
    expect(files.get("plugin/skills/use-personal-context/SKILL.md")).toContain("capture:");
    expect(files.get(".claude-plugin/marketplace.json")).toContain('"./plugin"');
    expect(files.get(".agents/plugins/marketplace.json")).toContain('"./plugin"');
    expect(files.get("INSTALL.md")).toBe(installGuideMarkdown());
  });

  it("uses the same install commands as the guide", () => {
    const markdown = installGuideMarkdown();
    for (const step of INSTALL_STEPS) {
      expect(markdown).toContain(step.title);
      expect(markdown).toContain(step.body);
    }
    expect(markdown).toContain("claude plugin marketplace add /absolute/path/to/personal-os-plugin");
    expect(markdown).toContain("claude plugin install personal-os@personal-os");
    expect(markdown).toContain("~/.cursor/plugins/local/personal-os");
    expect(markdown).toContain("codex plugin marketplace add /absolute/path/to/personal-os-plugin");
    expect(markdown).toContain("Node.js 20");
  });
});
