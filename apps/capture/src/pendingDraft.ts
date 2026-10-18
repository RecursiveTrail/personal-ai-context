import type { CaptureSource } from "./display.js";

export type PendingDraft = {
  text: string;
  source: CaptureSource;
  message?: string;
  messageIsError?: boolean;
};

let pending: PendingDraft | null = null;

export function setPendingDraft(draft: PendingDraft) {
  pending = draft;
}

export function consumePendingDraft(): PendingDraft | null {
  const draft = pending;
  pending = null;
  return draft;
}
