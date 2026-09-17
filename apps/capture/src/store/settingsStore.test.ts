import { describe, it, expect, beforeEach } from "vitest";
import {
  loadSettings,
  saveLlmSettings,
  isLlmConfigured,
  resolveChatCompletionsUrl,
  SETTINGS_KEY,
} from "./settingsStore.js";

beforeEach(() => {
  localStorage.clear();
});

describe("settingsStore", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadSettings().llm).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "",
    });
  });

  it("saves and reloads llm settings", () => {
    saveLlmSettings({
      apiKey: "sk-test",
      provider: "openrouter",
      model: "anthropic/claude-3.5-sonnet",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(loadSettings().llm).toMatchObject({
      apiKey: "sk-test",
      provider: "openrouter",
      model: "anthropic/claude-3.5-sonnet",
    });
    expect(localStorage.getItem(SETTINGS_KEY)).toBeTruthy();
  });

  it("detects when llm settings are configured", () => {
    expect(isLlmConfigured()).toBe(false);
    saveLlmSettings({ apiKey: "sk-test" });
    expect(isLlmConfigured()).toBe(true);
    saveLlmSettings({ provider: "custom", baseUrl: "" });
    expect(isLlmConfigured()).toBe(false);
    saveLlmSettings({ baseUrl: "https://example.com/v1" });
    expect(isLlmConfigured()).toBe(true);
  });

  it("resolves chat completion urls by provider", () => {
    expect(
      resolveChatCompletionsUrl({
        apiKey: "sk-test",
        provider: "openai",
        model: "gpt-4o-mini",
        baseUrl: "",
      })
    ).toBe("https://api.openai.com/v1/chat/completions");

    expect(
      resolveChatCompletionsUrl({
        apiKey: "sk-test",
        provider: "openrouter",
        model: "gpt-4o-mini",
        baseUrl: "",
      })
    ).toBe("https://openrouter.ai/api/v1/chat/completions");

    expect(
      resolveChatCompletionsUrl({
        apiKey: "sk-test",
        provider: "custom",
        model: "llama3",
        baseUrl: "https://example.com/v1/",
      })
    ).toBe("https://example.com/v1/chat/completions");
  });

  it("returns defaults and clears corrupt localStorage", () => {
    localStorage.setItem(SETTINGS_KEY, "{bad json");
    expect(loadSettings().llm.provider).toBe("openai");
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });
});
