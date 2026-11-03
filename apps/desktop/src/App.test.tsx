import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

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
      case "mcp_connect_info":
        return {
          mcpBinary: "/bin/personal-os-mcp",
          packPath: "/Users/me/.personal-os/personal-os",
        };
      default:
        throw new Error(`unexpected ${cmd}`);
    }
  });
});

afterEach(cleanup);

describe("desk", () => {
  it("lists shelves and notes, and filters by shelf", async () => {
    renderApp();
    expect(await screen.findByText("Morning routine")).toBeTruthy();
    expect(screen.getByText("Goals 2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "goals" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "goals" }));
    await waitFor(() => expect(screen.queryByText("Morning routine")).toBeNull());
    expect(invoke).toHaveBeenCalledWith("list_notes", { shelf: "goals" });
  });

  it("opens a note in the editor and saves edits via upsert_note", async () => {
    renderApp();
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
    renderApp();
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
    renderApp();
    fireEvent.click(await screen.findByText("Morning routine"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("delete_note", { idOrPath: "n1" }));
    await waitFor(() => expect(screen.queryByText("Morning routine")).toBeNull());
  });

  it("shows backend errors", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "mcp_connect_info") {
        return {
          mcpBinary: "/bin/personal-os-mcp",
          packPath: "/Users/me/.personal-os/personal-os",
        };
      }
      throw new Error("pack unavailable");
    });
    renderApp();
    expect((await screen.findByRole("alert")).textContent).toContain("pack unavailable");
  });

  it("does not show pending approval UI", async () => {
    renderApp();
    await screen.findByText("Morning routine");
    expect(screen.queryByLabelText(/pending approvals/i)).toBeNull();
    expect(screen.queryByText(/pending approval/i)).toBeNull();
  });

  it("navigates to Connect MCP and Home", async () => {
    renderApp("/");
    await screen.findByText("Morning routine");
    fireEvent.click(screen.getByRole("link", { name: "Connect MCP" }));
    expect(await screen.findByText(/point cursor at this pack/i)).toBeTruthy();
    expect(screen.queryByText("Morning routine")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(await screen.findByText("Morning routine")).toBeTruthy();
  });

  it("brand home returns to the desk", async () => {
    renderApp("/connect");
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(await screen.findByText("Morning routine")).toBeTruthy();
  });
});
