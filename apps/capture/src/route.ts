export type DeskRoute =
  | { view: "hub" }
  | { view: "ledger" }
  | { view: "audio" }
  | { view: "shelf"; slug: string };

export function parseRoute(hash: string): DeskRoute {
  if (hash === "#/ledger") return { view: "ledger" };
  if (hash === "#/audio") return { view: "audio" };
  const match = /^#\/shelf\/([^/?#]+)/.exec(hash);
  if (!match?.[1]) return { view: "hub" };
  try {
    return { view: "shelf", slug: decodeURIComponent(match[1]) };
  } catch {
    return { view: "hub" };
  }
}

export function shelfHash(slug: string): string {
  return `#/shelf/${encodeURIComponent(slug)}`;
}
