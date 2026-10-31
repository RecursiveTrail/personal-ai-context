import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { PendingPanel } from "./PendingPanel";
import type { PendingRecord } from "../lib/tauriApi";

const upsert: PendingRecord = {
  id: "pend_1",
  op: "upsert",
  createdAt: "2026-01-01T00:00:00Z",
  source: "mcp",
  status: "pending",
  targetIdOrPath: null,
  note: {
    id: "n9",
    title: "New idea",
    shelf: "ideas",
    tags: [],
    created: "",
    updated: "",
    body: "A short body",
    path: "ideas/new.md",
  },
};
const del: PendingRecord = {
  ...upsert,
  id: "pend_2",
  op: "delete",
  note: null,
  targetIdOrPath: "old-note",
};

let queue: PendingRecord[];

beforeEach(() => {
  queue = [upsert, del];
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string, args: any) => {
    switch (cmd) {
      case "list_pending":
        return queue;
      case "approve_pending":
      case "reject_pending":
        queue = queue.filter((r) => r.id !== args.id);
        return cmd === "approve_pending" ? upsert : undefined;
      default:
        throw new Error(`unexpected ${cmd}`);
    }
  });
});

afterEach(cleanup);

describe("PendingPanel", () => {
  it("shows badge count and record details", async () => {
    render(<PendingPanel />);
    expect(await screen.findByText("New idea")).toBeTruthy();
    expect(screen.getByLabelText("Pending count").textContent).toBe("2");
    expect(screen.getByText("ideas")).toBeTruthy();
    expect(screen.getByText("A short body")).toBeTruthy();
    expect(screen.getByText("old-note")).toBeTruthy();
    expect(screen.getByText("delete")).toBeTruthy();
  });

  it("approves via approve_pending, refreshes, and notifies", async () => {
    const onResolved = vi.fn();
    render(<PendingPanel onResolved={onResolved} />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve New idea" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("approve_pending", { id: "pend_1" }));
    await waitFor(() => expect(screen.queryByText("New idea")).toBeNull());
    expect(screen.getByLabelText("Pending count").textContent).toBe("1");
    expect(onResolved).toHaveBeenCalled();
  });

  it("rejects via reject_pending", async () => {
    render(<PendingPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Reject old-note" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("reject_pending", { id: "pend_2" }));
    await waitFor(() => expect(screen.queryByText("old-note")).toBeNull());
  });

  it("polls on an interval", async () => {
    render(<PendingPanel pollMs={20} />);
    await screen.findByText("New idea");
    const count = () => invoke.mock.calls.filter((c) => c[0] === "list_pending").length;
    await waitFor(() => expect(count()).toBeGreaterThanOrEqual(3));
  });
});
