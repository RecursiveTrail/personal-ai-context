import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { App } from "./App";
import type { Note } from "./lib/tauriApi";

const note = (over: Partial<Note>): Note => ({
  id: "n1",
  title: "Morning routine",
  shelf: "routines",
  tags: ["daily"],
  created: "2026-01-01T00:00:00Z",
  updated: "2026-01-01T00:00:00Z",
  body: "Coffee first.",
  path: "routines/morning.md",
  ...over,
});

let notes: Note[];

beforeEach(() => {
  notes = [note({}), note({ id: "n2", title: "Goals 2026", shelf: "goals", path: "goals/g.md" })];
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string, args: any) => {
    switch (cmd) {
      case "list_shelves":
        return ["goals", "routines"];
      case "list_notes":
        return args.shelf ? notes.filter((n) => n.shelf === args.shelf) : notes;
      case "get_note":
        return notes.find((n) => n.id === args.idOrPath) ?? null;
      case "upsert_note": {
        const saved = note({ ...args.input, id: args.input.id ?? "n3", path: "x.md" });
        notes = [...notes.filter((n) => n.id !== saved.id), saved];
        return saved;
      }
      case "delete_note":
        notes = notes.filter((n) => n.id !== args.idOrPath);
        return true;
      case "list_pending":
        return [];
      default:
        throw new Error(`unexpected ${cmd}`);
    }
  });
});

afterEach(cleanup);

describe("desk", () => {
  it("lists shelves and notes, and filters by shelf", async () => {
    render(<App />);
    expect(await screen.findByText("Morning routine")).toBeTruthy();
    expect(screen.getByText("Goals 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "goals" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "goals" }));
    await waitFor(() => expect(screen.queryByText("Morning routine")).toBeNull());
    expect(invoke).toHaveBeenCalledWith("list_notes", { shelf: "goals" });
  });

  it("opens a note in the editor and saves edits via upsert_note", async () => {
    render(<App />);
    fireEvent.click(await screen.findByText("Morning routine"));
    const body = (await screen.findByLabelText("Body")) as HTMLTextAreaElement;
    expect(body.value).toBe("Coffee first.");

    fireEvent.change(body, { target: { value: "Tea first." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("upsert_note", {
        input: { id: "n1", title: "Morning routine", shelf: "routines", body: "Tea first.", tags: ["daily"] },
      }),
    );
  });

  it("creates a new note without an id", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "New note" }));
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Fresh" } });
    fireEvent.change(screen.getByLabelText("Shelf"), { target: { value: "ideas" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("upsert_note", {
        input: { id: undefined, title: "Fresh", shelf: "ideas", body: "", tags: [] },
      }),
    );
  });

  it("deletes a note after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    fireEvent.click(await screen.findByText("Morning routine"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("delete_note", { idOrPath: "n1" }));
    await waitFor(() => expect(screen.queryByText("Morning routine")).toBeNull());
  });

  it("shows backend errors", async () => {
    invoke.mockRejectedValue("pack unavailable");
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("pack unavailable");
  });
});
