import { DEFAULT_SHELVES, type DefaultShelf } from "@personal-os/pack-core";

export const SHELF_DETAILS: Record<
  DefaultShelf,
  { label: string; description: string }
> = {
  preferences: {
    label: "Preferences",
    description: "How you like things done",
  },
  routines: {
    label: "Routines",
    description: "Recurring habits",
  },
  "ai-collaboration": {
    label: "AI collaboration",
    description: "How an assistant should work with you",
  },
  goals: {
    label: "Goals",
    description: "What you are trying to finish",
  },
};

export function shelfLabel(shelf: string): string {
  if ((DEFAULT_SHELVES as readonly string[]).includes(shelf)) {
    return SHELF_DETAILS[shelf as DefaultShelf].label;
  }
  return shelf;
}

export function shelfChoices(current: string): Array<{
  id: string;
  label: string;
  description: string;
}> {
  const choices: Array<{ id: string; label: string; description: string }> =
    DEFAULT_SHELVES.map((id) => ({
      id,
      ...SHELF_DETAILS[id],
    }));
  if (!(DEFAULT_SHELVES as readonly string[]).includes(current)) {
    choices.push({ id: current, label: current, description: "" });
  }
  return choices;
}

const RECENT_MS = 2 * 60 * 1000;

export function formatNoteUpdated(iso: string, now = Date.now()): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "Updated";
  const age = now - time;
  if (age >= 0 && age < RECENT_MS) return "Edited just now";
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
  return `Updated ${formatted}`;
}
