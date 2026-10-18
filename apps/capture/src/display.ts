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

export type CaptureSource = "text" | "voice" | "pdf" | "clipboard";

const CAPTURE_SOURCES: readonly CaptureSource[] = [
  "text",
  "voice",
  "pdf",
  "clipboard",
];

export function captureTag(source: CaptureSource): string {
  return `capture:${source}`;
}

export function splitCaptureTag(tags: string[]): {
  source: CaptureSource;
  tags: string[];
} {
  let source: CaptureSource = "text";
  const visible: string[] = [];
  for (const tag of tags) {
    if (tag.startsWith("capture:")) {
      const value = tag.slice("capture:".length);
      if ((CAPTURE_SOURCES as readonly string[]).includes(value)) {
        source = value as CaptureSource;
      }
      continue;
    }
    visible.push(tag);
  }
  return { source, tags: visible };
}

export const SOURCE_LABEL: Record<CaptureSource, string> = {
  text: "Typed note",
  voice: "Voice memo transcript",
  pdf: "PDF extraction",
  clipboard: "Text paste",
};

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function byteSize(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function quickNoteTitle(text: string): string {
  const line = text.trim().split(/\n/, 1)[0]?.trim() ?? "";
  if (!line) return "Note";
  if (line.length <= 80) return line;
  return `${line.slice(0, 77).trimEnd()}…`;
}

export function formatNoteCreated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Created";
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
  return `Created ${formatted}`;
}

export function categoryLabel(tags: string[], fallback: string): string {
  const visible = splitCaptureTag(tags).tags[0];
  if (!visible) return fallback;
  return visible
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 10) return `${kb.toFixed(1)} KB`;
  return `${Math.round(kb)} KB`;
}

export function directiveLabel(index: number): string {
  return `Directive ${String(index).padStart(2, "0")}`;
}

export function shelfStatusLine(
  notes: Array<{ body: string; updated: string }>,
  now = new Date()
): string {
  const countLabel = `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;
  const words = notes.reduce((sum, note) => sum + wordCount(note.body), 0);
  const wordLabel = `${words} ${words === 1 ? "word" : "words"}`;
  if (notes.length === 0) return `${countLabel} · No updates · ${wordLabel}`;
  const latest = notes.reduce((current, note) =>
    note.updated > current.updated ? note : current
  );
  const updated = new Date(latest.updated);
  const sameDay =
    !Number.isNaN(updated.getTime()) &&
    updated.getFullYear() === now.getFullYear() &&
    updated.getMonth() === now.getMonth() &&
    updated.getDate() === now.getDate();
  const when = sameDay
    ? "Updated today"
    : formatNoteUpdated(latest.updated, now.getTime());
  return `${countLabel} · ${when} · ${wordLabel}`;
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
