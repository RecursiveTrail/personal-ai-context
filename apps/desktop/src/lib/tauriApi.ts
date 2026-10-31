import { invoke } from "@tauri-apps/api/core";

export type Note = {
  id: string;
  title: string;
  shelf: string;
  tags: string[];
  created: string;
  updated: string;
  body: string;
  path: string;
};

export type NoteInput = {
  id?: string;
  title: string;
  shelf: string;
  body: string;
  tags?: string[];
};

export const listShelves = () => invoke<string[]>("list_shelves");

export const listNotes = (shelf?: string | null) =>
  invoke<Note[]>("list_notes", { shelf: shelf ?? null });

export const getNote = (idOrPath: string) => invoke<Note | null>("get_note", { idOrPath });

export const upsertNote = (input: NoteInput) => invoke<Note>("upsert_note", { input });

export const deleteNote = (idOrPath: string) => invoke<boolean>("delete_note", { idOrPath });

export type PendingRecord = {
  id: string;
  op: "upsert" | "delete";
  createdAt: string;
  source: string;
  note: Note | null;
  targetIdOrPath: string | null;
  status: string;
};

export const listPending = () => invoke<PendingRecord[]>("list_pending");

export const approvePending = (id: string) => invoke<PendingRecord>("approve_pending", { id });

export const rejectPending = (id: string) => invoke<void>("reject_pending", { id });
