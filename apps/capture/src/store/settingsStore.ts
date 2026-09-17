export const SETTINGS_KEY = "personal-os.settings.v1";

export type LlmProvider = "openai" | "openrouter" | "custom";

export type LlmSettings = {
  apiKey: string;
  provider: LlmProvider;
  model: string;
  baseUrl: string;
};

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  apiKey: "",
  provider: "openai",
  model: "gpt-4o-mini",
  baseUrl: "",
};

export type AppSettings = {
  llm: LlmSettings;
};

const DEFAULT_SETTINGS: AppSettings = {
  llm: DEFAULT_LLM_SETTINGS,
};

function readRaw(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      localStorage.removeItem(SETTINGS_KEY);
      return structuredClone(DEFAULT_SETTINGS);
    }
    const record = parsed as Partial<AppSettings>;
    return {
      llm: {
        ...DEFAULT_LLM_SETTINGS,
        ...(record.llm && typeof record.llm === "object" ? record.llm : {}),
      },
    };
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function writeRaw(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSettings(): AppSettings {
  return readRaw();
}

export function saveLlmSettings(patch: Partial<LlmSettings>): LlmSettings {
  const settings = readRaw();
  settings.llm = { ...settings.llm, ...patch };
  writeRaw(settings);
  return settings.llm;
}

export function isLlmConfigured(settings: AppSettings = readRaw()): boolean {
  const { apiKey, provider, baseUrl } = settings.llm;
  if (!apiKey.trim()) return false;
  if (provider === "custom" && !baseUrl.trim()) return false;
  return true;
}

export function resolveChatCompletionsUrl(settings: LlmSettings): string {
  const trimmedBase = settings.baseUrl.trim().replace(/\/$/, "");
  if (settings.provider === "openrouter") {
    return `${trimmedBase || "https://openrouter.ai/api/v1"}/chat/completions`;
  }
  if (settings.provider === "custom") {
    if (!trimmedBase) {
      throw new Error("Base URL is required for a custom provider.");
    }
    return trimmedBase.endsWith("/chat/completions")
      ? trimmedBase
      : `${trimmedBase}/chat/completions`;
  }
  return "https://api.openai.com/v1/chat/completions";
}
