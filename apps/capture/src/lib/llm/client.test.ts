import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processCapturedText } from "./client.js";
import { saveLlmSettings } from "../../store/settingsStore.js";

beforeEach(() => {
  localStorage.clear();
  saveLlmSettings({
    apiKey: "sk-test",
    provider: "openai",
    model: "gpt-4o-mini",
    baseUrl: "",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("processCapturedText", () => {
  it("sends captured text to the provider and returns the refined body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Keep answers concise." } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(processCapturedText("keep answers concise")).resolves.toBe(
      "Keep answers concise."
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "gpt-4o-mini",
      messages: expect.arrayContaining([
        expect.objectContaining({ role: "user" }),
      ]),
    });
  });

  it("requires note text and an api key", async () => {
    await expect(processCapturedText("   ")).rejects.toThrow(
      "Add note text before processing."
    );

    saveLlmSettings({ apiKey: "" });
    await expect(processCapturedText("hello")).rejects.toThrow(
      "Add an API key in LLM settings first."
    );
  });

  it("surfaces provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid API key" } }),
      })
    );

    await expect(processCapturedText("hello")).rejects.toThrow(
      "Invalid API key"
    );
  });
});
