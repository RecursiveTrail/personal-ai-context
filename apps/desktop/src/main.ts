import { invoke } from "@tauri-apps/api/core";

type Status = { pack_path: string; notes: number; http_addr: string };

const byId = (id: string) => document.getElementById(id);

function render(status: Status) {
  const set = (id: string, text: string) => {
    const el = byId(id);
    if (el) el.textContent = text;
  };
  set("pack-path", status.pack_path);
  set("note-count", String(status.notes));
  set("health-url", `http://${status.http_addr}/health`);
  set("status", "Running");
}

async function refresh() {
  try {
    render(await invoke<Status>("get_status"));
  } catch (error) {
    const el = byId("status");
    if (el) el.textContent = `Error: ${String(error)}`;
  }
}

void refresh();
setInterval(() => void refresh(), 3000);
