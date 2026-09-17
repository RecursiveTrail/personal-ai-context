import { useState, type FormEvent } from "react";
import {
  DEFAULT_LLM_SETTINGS,
  loadSettings,
  saveLlmSettings,
  type LlmProvider,
} from "../store/settingsStore.js";

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  custom: "Custom (OpenAI-compatible)",
};

export function SettingsPanel() {
  const initial = loadSettings().llm;
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<LlmProvider>(initial.provider);
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [model, setModel] = useState(initial.model);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveLlmSettings({ provider, apiKey, model, baseUrl });
    setMessage("LLM settings saved locally.");
  }

  function reset() {
    setProvider(DEFAULT_LLM_SETTINGS.provider);
    setApiKey(DEFAULT_LLM_SETTINGS.apiKey);
    setModel(DEFAULT_LLM_SETTINGS.model);
    setBaseUrl(DEFAULT_LLM_SETTINGS.baseUrl);
    saveLlmSettings(DEFAULT_LLM_SETTINGS);
    setMessage("LLM settings reset.");
  }

  return (
    <section className="settingsPanel" aria-labelledby="settings-heading">
      <div className="settingsPanelHeader">
        <h2 id="settings-heading">LLM settings</h2>
        <button type="button" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open ? (
        <form className="settingsForm" onSubmit={submit}>
          {message ? (
            <p className="banner" role="status">
              {message}
            </p>
          ) : null}

          <p className="settingsHint">
            Bring your own API key. Keys stay in this browser only and are sent
            directly to your chosen provider.
          </p>

          <label htmlFor="settings-provider">Provider</label>
          <select
            id="settings-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as LlmProvider)}
          >
            {(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((option) => (
              <option key={option} value={option}>
                {PROVIDER_LABELS[option]}
              </option>
            ))}
          </select>

          <label htmlFor="settings-api-key">API key</label>
          <input
            id="settings-api-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
          />

          <label htmlFor="settings-model">Model</label>
          <input
            id="settings-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="gpt-4o-mini"
            required
          />

          {provider === "custom" || provider === "openrouter" ? (
            <>
              <label htmlFor="settings-base-url">
                {provider === "custom" ? "Base URL" : "Base URL (optional)"}
              </label>
              <input
                id="settings-base-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={
                  provider === "openrouter"
                    ? "https://openrouter.ai/api/v1"
                    : "https://your-host/v1"
                }
                required={provider === "custom"}
              />
            </>
          ) : null}

          <div className="actions">
            <button type="button" className="secondary" onClick={reset}>
              Reset
            </button>
            <button type="submit">Save settings</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
