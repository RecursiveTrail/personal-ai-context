import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { ConnectMcp } from "./ConnectMcp";

beforeEach(() => {
  invoke.mockReset();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});
afterEach(() => cleanup());

describe("ConnectMcp", () => {
  it("shows snippet and Copy without approval copy", async () => {
    invoke.mockResolvedValue({
      mcpBinary: "/Apps/Chit.app/Contents/MacOS/personal-os-mcp",
      packPath: "/Users/me/.personal-os/personal-os",
    });
    render(<ConnectMcp />);
    expect(await screen.findByText(/point cursor at this pack/i)).toBeTruthy();
    expect(screen.getByText(/personal-os-mcp/)).toBeTruthy();
    expect(screen.queryByText(/Approve/i)).toBeNull();
    expect(screen.queryByText(/pending/i)).toBeNull();
    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });

  it("copies JSON on Copy", async () => {
    invoke.mockResolvedValue({
      mcpBinary: "/bin/personal-os-mcp",
      packPath: "/pack",
    });
    render(<ConnectMcp />);
    const copy = await screen.findByRole("button", { name: /copy/i });
    fireEvent.click(copy);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      const arg = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(arg).toContain("mcpServers");
      expect(arg).toContain("/bin/personal-os-mcp");
      expect(arg).toContain("/pack");
    });
  });

  it("shows error and no Copy when invoke fails", async () => {
    invoke.mockRejectedValue("personal-os-mcp not found at /x/personal-os-mcp");
    render(<ConnectMcp />);
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/not found/i);
    });
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
  });
});
