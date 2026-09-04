export function resolvePackPath(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): string {
  const flagIndex = argv.indexOf("--pack");
  if (flagIndex >= 0 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  if (env.PERSONAL_OS_PACK_PATH) return env.PERSONAL_OS_PACK_PATH;

  throw new Error(
    "Set PERSONAL_OS_PACK_PATH or pass --pack /path/to/personal-os"
  );
}

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }
  return port;
}
