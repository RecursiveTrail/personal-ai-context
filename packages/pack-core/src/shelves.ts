export type PackShelf = {
  slug: string;
  name: string;
  description: string;
  color: string;
  order: number;
  isDefault: boolean;
};

export type ShelvesFile = {
  version: 1;
  shelves: PackShelf[];
};

const COLOR = /^#[0-9a-fA-F]{6}$/;

function isShelf(value: unknown): value is PackShelf {
  if (!value || typeof value !== "object") return false;
  const shelf = value as Partial<PackShelf>;
  return (
    typeof shelf.slug === "string" &&
    shelf.slug.trim() !== "" &&
    typeof shelf.name === "string" &&
    shelf.name.trim() !== "" &&
    typeof shelf.description === "string" &&
    shelf.description.trim() !== "" &&
    typeof shelf.color === "string" &&
    COLOR.test(shelf.color) &&
    typeof shelf.order === "number" &&
    Number.isFinite(shelf.order) &&
    typeof shelf.isDefault === "boolean"
  );
}

export function serializeShelves(shelves: PackShelf[]): string {
  const file: ShelvesFile = {
    version: 1,
    shelves: [...shelves].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)),
  };
  return JSON.stringify(file, null, 2);
}

export function parseShelves(json: string): PackShelf[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid shelves file");
  }
  if (!parsed || typeof parsed !== "object" || !("shelves" in parsed)) {
    throw new Error("Invalid shelves file");
  }
  const shelves = (parsed as { shelves?: unknown }).shelves;
  if (!Array.isArray(shelves) || !shelves.every(isShelf)) {
    throw new Error("Invalid shelves file");
  }
  return shelves;
}
