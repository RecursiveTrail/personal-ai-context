import { slugifyTitle } from "@personal-os/pack-core";
import { STORAGE_KEY } from "./notesStore.js";
import { SETTINGS_KEY } from "./settingsStore.js";

export const SHELVES_KEY = "personal-os.shelves.v1";

export type ShelfRecord = {
  slug: string;
  name: string;
  description: string;
  color: string;
  order: number;
  isDefault: boolean;
};

export const SHELF_COLORS = [
  "#0f6e6e",
  "#246868",
  "#3e4948",
  "#8f2d2d",
  "#1e1b19",
  "#6e7979",
] as const;

const DEFAULTS: ShelfRecord[] = [
  {
    slug: "preferences",
    name: "Preferences",
    description:
      "How you like things done, communication style, brevity rules, and ambient cognition guides.",
    color: "#0f6e6e",
    order: 1,
    isDefault: true,
  },
  {
    slug: "ai-collaboration",
    name: "AI collaboration",
    description:
      "Protocols for how assistants interact, verify code, and avoid hallucination.",
    color: "#246868",
    order: 2,
    isDefault: true,
  },
  {
    slug: "goals",
    name: "Goals",
    description: "Active deliverables, milestones, and finished targets.",
    color: "#8f2d2d",
    order: 3,
    isDefault: true,
  },
  {
    slug: "routines",
    name: "Routines",
    description: "Daily anchors, review cadences, and scheduling protocols.",
    color: "#3e4948",
    order: 4,
    isDefault: true,
  },
  {
    slug: "work",
    name: "Work",
    description: "Job context, projects, stakeholders, and professional notes.",
    color: "#1e1b19",
    order: 5,
    isDefault: true,
  },
  {
    slug: "personal",
    name: "Personal",
    description: "Home life, health, relationships, and private notes.",
    color: "#6e7979",
    order: 6,
    isDefault: true,
  },
];

export const SUGGESTED_TAGS: Record<string, string[]> = {
  preferences: ["concise", "formatting", "tone"],
  "ai-collaboration": ["guardrails", "git", "safety"],
  goals: ["ship-v1", "mcp", "q4"],
  routines: [],
  work: ["project", "meeting", "stakeholder"],
  personal: ["home", "health", "family"],
};

export const SHELF_KINDS: Record<string, string> = {
  preferences: "Instruction & Protocol",
  "ai-collaboration": "Guardrails",
  goals: "Targets",
  routines: "Cadence",
  work: "Professional",
  personal: "Life",
};

function cloneDefaults(): ShelfRecord[] {
  return DEFAULTS.map((shelf) => ({ ...shelf }));
}

function isShelfRecord(value: unknown): value is ShelfRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ShelfRecord>;
  return (
    typeof record.slug === "string" &&
    typeof record.name === "string" &&
    typeof record.description === "string" &&
    typeof record.color === "string" &&
    typeof record.order === "number" &&
    typeof record.isDefault === "boolean"
  );
}

export function loadShelves(): ShelfRecord[] {
  const raw = localStorage.getItem(SHELVES_KEY);
  if (!raw) return cloneDefaults();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(SHELVES_KEY);
      return cloneDefaults();
    }
    const stored = parsed.filter(isShelfRecord);
    const defaults = cloneDefaults().map((fallback) => {
      const saved = stored.find((shelf) => shelf.slug === fallback.slug);
      if (!saved) return fallback;
      return {
        ...fallback,
        name: saved.name.trim() || fallback.name,
        description: saved.description,
        color: saved.color,
        order: saved.order,
        isDefault: true,
      };
    });
    const custom = stored.filter(
      (shelf) =>
        !shelf.isDefault && !defaults.some((item) => item.slug === shelf.slug)
    );
    return [...defaults, ...custom].sort((a, b) => a.order - b.order);
  } catch {
    localStorage.removeItem(SHELVES_KEY);
    return cloneDefaults();
  }
}

function writeShelves(shelves: ShelfRecord[]) {
  localStorage.setItem(SHELVES_KEY, JSON.stringify(shelves));
}

export function saveShelves(shelves: ShelfRecord[]): void {
  writeShelves(shelves);
}

export function createShelf(input: {
  name: string;
  description: string;
  color: string;
}): ShelfRecord {
  const name = input.name.trim();
  if (!name) throw new Error("Shelf name is required.");
  const slug = slugifyTitle(name);
  if (slug === "note") throw new Error("Use a name with letters or numbers.");
  const shelves = loadShelves();
  if (shelves.some((shelf) => shelf.slug === slug)) {
    throw new Error("A shelf with that name already exists.");
  }
  const shelf: ShelfRecord = {
    slug,
    name,
    description: input.description.trim(),
    color: input.color,
    order: Math.max(...shelves.map((item) => item.order)) + 1,
    isDefault: false,
  };
  writeShelves([...shelves, shelf]);
  return shelf;
}

export function updateShelf(
  slug: string,
  patch: Partial<Pick<ShelfRecord, "name" | "description" | "color">>
): ShelfRecord {
  const shelves = loadShelves();
  const index = shelves.findIndex((shelf) => shelf.slug === slug);
  if (index < 0) throw new Error("Shelf not found.");
  const current = shelves[index];
  const nextName = current.isDefault
    ? current.name
    : patch.name?.trim() || current.name;
  const next: ShelfRecord = {
    ...current,
    name: nextName,
    description:
      patch.description !== undefined
        ? patch.description.trim()
        : current.description,
    color: patch.color ?? current.color,
  };
  shelves[index] = next;
  writeShelves(shelves);
  return next;
}

export function deleteShelf(slug: string): void {
  const shelves = loadShelves();
  const shelf = shelves.find((item) => item.slug === slug);
  if (!shelf) throw new Error("Shelf not found.");
  if (shelf.isDefault) throw new Error("Default shelves stay on the desk.");
  writeShelves(shelves.filter((item) => item.slug !== slug));
}

export function clearLedger(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SHELVES_KEY);
}

export function browserLedgerBytes(): number {
  return [STORAGE_KEY, SHELVES_KEY, SETTINGS_KEY].reduce((total, key) => {
    const value = localStorage.getItem(key);
    return total + (value ? new TextEncoder().encode(value).length : 0);
  }, 0);
}

export function shelfKind(slug: string): string {
  return SHELF_KINDS[slug] ?? "Custom shelf";
}
