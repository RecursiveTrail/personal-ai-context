import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePackPath, resolvePort } from "./config.js";

describe("resolvePackPath", () => {
  it("prefers --pack over the environment", () => {
    expect(
      resolvePackPath(
        ["node", "server.js", "--pack", "/from/flag"],
        { PERSONAL_OS_PACK_PATH: "/from/env" }
      )
    ).toBe("/from/flag");
  });

  it("uses PERSONAL_OS_PACK_PATH when --pack is absent", () => {
    expect(
      resolvePackPath(["node", "server.js"], {
        PERSONAL_OS_PACK_PATH: "/from/env",
      })
    ).toBe("/from/env");
  });

  it("throws when no pack path is configured", () => {
    expect(() => resolvePackPath(["node", "server.js"], {})).toThrow(
      "Set PERSONAL_OS_PACK_PATH or pass --pack"
    );
  });

  it("uses personal-os beside the server when that directory exists", () => {
    expect(
      resolvePackPath(["node", "server.js"], {}, {
        serverFile: "/plugin/server/server.js",
        directoryExists: (dir) => dir === path.join("/plugin", "personal-os"),
      })
    ).toBe(path.join("/plugin", "personal-os"));
  });

  it("keeps the missing-path error when the sibling directory is absent", () => {
    expect(() =>
      resolvePackPath(["node", "server.js"], {}, {
        serverFile: "/plugin/server/server.js",
        directoryExists: () => false,
      })
    ).toThrow("Set PERSONAL_OS_PACK_PATH or pass --pack");
  });
});

describe("resolvePort", () => {
  it("defaults to 8787 and accepts PORT", () => {
    expect(resolvePort({})).toBe(8787);
    expect(resolvePort({ PORT: "9000" })).toBe(9000);
  });

  it("rejects invalid ports", () => {
    expect(() => resolvePort({ PORT: "invalid" })).toThrow("Invalid PORT");
  });
});
