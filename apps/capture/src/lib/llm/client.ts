import {
  loadSettings,
  resolveChatCompletionsUrl,
  type LlmSettings,
} from "../../store/settingsStore.js";
import {
  buildProcessCapturedTextUserPrompt,
  PROCESS_CAPTURED_TEXT_SYSTEM,
} from "./prompts.js";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

function extractMessageContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
          ? part.text
          : ""
      )
      .join("")
      .trim();
  }
  return "";
}

function buildHeaders(settings: LlmSettings): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${settings.apiKey.trim()}`,
  };
  if (settings.provider === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin;
    headers["X-Title"] = "Personal OS Capture";
  }
  return headers;
}

async function createChatCompletion(
  settings: LlmSettings,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const response = await fetch(resolveChatCompletionsUrl(settings), {
    method: "POST",
    headers: buildHeaders(settings),
    body: JSON.stringify({
      model: settings.model.trim() || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  const payload = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `LLM request failed with status ${response.status}.`
    );
  }

  const content = extractMessageContent(payload.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("LLM returned an empty response.");
  }
  return content;
}

export async function processCapturedText(
  raw: string,
  settings: LlmSettings = loadSettings().llm
): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Add note text before processing.");
  }
  if (!settings.apiKey.trim()) {
    throw new Error("Add an API key in LLM settings first.");
  }

  return createChatCompletion(
    settings,
    PROCESS_CAPTURED_TEXT_SYSTEM,
    buildProcessCapturedTextUserPrompt(trimmed)
  );
}
