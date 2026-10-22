import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, "../src/server.ts");
const outfile = path.resolve(
  here,
  "../../capture/src/generated/plugin-server.js"
);

mkdirSync(path.dirname(outfile), { recursive: true });

// server.ts carries its own shebang for the tsc build. esbuild would emit it
// again after the banner, and a second `#!` line is a syntax error, so strip
// it from the entry; the banner supplies the one shebang.
const stripEntryShebang = {
  name: "strip-entry-shebang",
  setup(build) {
    build.onLoad({ filter: /server\.ts$/ }, (args) => {
      if (args.path !== entry) return undefined;
      const source = readFileSync(args.path, "utf8");
      return {
        contents: source.replace(/^#!.*\r?\n/, ""),
        loader: "ts",
      };
    });
  },
};

await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  // CommonJS dependencies bundled into ESM call require() for node builtins;
  // give them a real require so the single-file output runs under plain node.
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __createRequire } from "node:module";',
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  plugins: [stripEntryShebang],
  logLevel: "info",
});
