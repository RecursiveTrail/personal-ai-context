import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MISSING_PACK =
  "Set PERSONAL_OS_PACK_PATH or pass --pack /path/to/personal-os";

export function resolvePackPath(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  options: {
    serverFile?: string;
    directoryExists?: (dir: string) => boolean;
  } = {}
): string {
  const flagIndex = argv.indexOf("--pack");
  if (flagIndex >= 0 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  if (env.PERSONAL_OS_PACK_PATH) return env.PERSONAL_OS_PACK_PATH;

  const serverFile = options.serverFile ?? fileURLToPath(import.meta.url);
  const sibling = path.join(path.dirname(serverFile), "..", "personal-os");
  const directoryExists = options.directoryExists ?? existsSync;
  if (directoryExists(sibling)) return sibling;
  throw new Error(MISSING_PACK);
}

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return port;
}
