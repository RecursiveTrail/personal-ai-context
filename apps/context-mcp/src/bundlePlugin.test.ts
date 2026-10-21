import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plugin server bundle", () => {
  it("starts with a node shebang and carries the server", () => {
    const source = readFileSync(
      new URL("../../capture/src/generated/plugin-server.js", import.meta.url),
      "utf8"
    );
    expect(source.startsWith("#!/usr/bin/env node\n")).toBe(true);
    expect(source).toContain("personal-os");
  });
});
