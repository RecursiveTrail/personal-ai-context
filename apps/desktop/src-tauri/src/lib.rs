pub mod fs_write;
pub mod http;
pub mod mcp;
pub mod mcp_connect;
pub mod pack;
pub mod pending;
pub mod store;
pub mod sync;
pub mod watch;

use parking_lot::{Mutex, RwLock};
use pack::types::Note;
use pending::PendingRecord;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use pending::PendingQueue;
use store::{Store, UpsertInput};
use tauri::{Manager, State};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

/// Shelves created when the pack directory is missing.
pub const DEFAULT_SHELVES: [&str; 6] = [
    "preferences",
    "routines",
    "ai-collaboration",
    "goals",
    "work",
    "personal",
];

pub const DEFAULT_HTTP_ADDR: &str = "127.0.0.1:8787";

/// `~/.personal-os/personal-os`
pub fn default_pack_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or("cannot resolve home directory (HOME/USERPROFILE unset)")?;
    Ok(PathBuf::from(home).join(".personal-os").join("personal-os"))
}

/// Create `pack` and any missing default shelf directories (existing content is untouched).
pub fn ensure_pack_layout(pack: &Path) -> std::io::Result<()> {
    for shelf in DEFAULT_SHELVES {
        std::fs::create_dir_all(pack.join(shelf))?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Status {
    pub pack_path: String,
    pub notes: usize,
    pub http_addr: String,
}

/// Human edit from the desk UI; applied to the pack immediately (no approval queue).
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub id: Option<String>,
    pub title: String,
    pub shelf: String,
    pub body: String,
    pub tags: Option<Vec<String>>,
}

/// Running host services: shared store, HTTP server, and the pack watcher.
pub struct Host {
    store: Arc<RwLock<Store>>,
    pending: Arc<Mutex<PendingQueue>>,
    pack_path: Mutex<PathBuf>,
    watcher: Mutex<JoinHandle<()>>,
    http: JoinHandle<()>,
    http_addr: SocketAddr,
}

impl Host {
    /// Bootstrap `pack`, bind HTTP on `bind`, and start the watcher. Needs a tokio runtime.
    pub async fn start(pack: PathBuf, bind: SocketAddr) -> Result<Self, String> {
        ensure_pack_layout(&pack).map_err(|e| format!("cannot create {}: {e}", pack.display()))?;
        let store = Arc::new(RwLock::new(Store::load(pack.clone()).map_err(|e| e.to_string())?));
        let pending = Arc::new(Mutex::new(PendingQueue::load(pack.clone())));
        let listener = TcpListener::bind(bind)
            .await
            .map_err(|e| format!("cannot bind {bind}: {e}"))?;
        let http_addr = listener.local_addr().map_err(|e| e.to_string())?;
        let http = tokio::spawn({
            let store = store.clone();
            async move {
                if let Err(error) = http::serve_listener(store, listener).await {
                    eprintln!("http server stopped: {error}");
                }
            }
        });
        let watcher = watch::spawn_watcher(pack.clone(), store.clone());
        Ok(Self {
            store,
            pending,
            pack_path: Mutex::new(pack),
            watcher: Mutex::new(watcher),
            http,
            http_addr,
        })
    }

    /// Shared MCP pending queue (for desk approve/reject and an in-process MCP server).
    pub fn pending(&self) -> Arc<Mutex<PendingQueue>> {
        self.pending.clone()
    }

    pub fn list_shelves(&self) -> Vec<String> {
        self.store.read().list_shelves()
    }

    pub fn list_notes(&self, shelf: Option<&str>) -> Vec<Note> {
        let notes = self.store.read().all_notes();
        match shelf {
            Some(shelf) => notes.into_iter().filter(|n| n.shelf == shelf).collect(),
            None => notes,
        }
    }

    pub fn get_note(&self, id_or_path: &str) -> Option<Note> {
        self.store.read().get_note(id_or_path)
    }

    /// Human write: goes straight to the store (never queued).
    pub fn upsert_note(&self, input: NoteInput) -> Result<Note, String> {
        self.store
            .write()
            .upsert_note(UpsertInput {
                id: input.id,
                title: input.title,
                shelf: input.shelf,
                body: input.body,
                tags: input.tags,
                updated: None,
                created: None,
            })
            .map_err(|e| e.to_string())
    }

    /// Human delete: immediate. Returns whether a note was removed.
    pub fn delete_note(&self, id_or_path: &str) -> Result<bool, String> {
        self.store.write().delete_note(id_or_path).map_err(|e| e.to_string())
    }

    /// Re-read `_meta/pending` from disk. `personal-os-mcp` runs as a separate process and
    /// writes records there, so the in-memory queue must never be trusted on its own.
    /// Callers must hold the `pending` lock across reload + action.
    fn reload_pending(&self, queue: &mut PendingQueue) {
        let pack = self.pack_path.lock().clone();
        *queue = PendingQueue::load(pack);
    }

    pub fn list_pending(&self) -> Vec<PendingRecord> {
        let mut queue = self.pending.lock();
        self.reload_pending(&mut queue);
        queue.list()
    }

    pub fn approve_pending(&self, id: &str) -> Result<PendingRecord, String> {
        let mut queue = self.pending.lock();
        self.reload_pending(&mut queue);
        let mut store = self.store.write();
        queue.approve(id, &mut store).map_err(|e| e.to_string())
    }

    pub fn reject_pending(&self, id: &str) -> Result<(), String> {
        let mut queue = self.pending.lock();
        self.reload_pending(&mut queue);
        queue.reject(id).map_err(|e| e.to_string())
    }

    pub fn status(&self) -> Status {
        Status {
            pack_path: self.pack_path.lock().display().to_string(),
            notes: self.store.read().note_count(),
            http_addr: self.http_addr.to_string(),
        }
    }

    /// Switch to another pack: bootstrap it, swap the shared store (HTTP keeps serving the
    /// same handle), and restart the watcher. On failure the current pack stays active.
    pub fn set_pack_path(&self, path: &str) -> Result<Status, String> {
        if path.trim().is_empty() {
            return Err("pack path must not be empty".into());
        }
        let pack = PathBuf::from(path);
        ensure_pack_layout(&pack).map_err(|e| format!("cannot create {}: {e}", pack.display()))?;
        let fresh = Store::load(pack.clone()).map_err(|e| e.to_string())?;
        let fresh_pending = PendingQueue::load(pack.clone());
        *self.store.write() = fresh;
        *self.pending.lock() = fresh_pending;
        let mut watcher = self.watcher.lock();
        watcher.abort();
        *watcher = watch::spawn_watcher(pack.clone(), self.store.clone());
        *self.pack_path.lock() = pack;
        drop(watcher);
        Ok(self.status())
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        self.http.abort();
        self.watcher.lock().abort();
    }
}

#[tauri::command]
async fn get_status(host: State<'_, Host>) -> Result<Status, String> {
    Ok(host.status())
}

#[tauri::command]
async fn set_pack_path(host: State<'_, Host>, path: String) -> Result<Status, String> {
    host.set_pack_path(&path)
}

#[tauri::command]
async fn list_shelves(host: State<'_, Host>) -> Result<Vec<String>, String> {
    Ok(host.list_shelves())
}

#[tauri::command]
async fn list_notes(host: State<'_, Host>, shelf: Option<String>) -> Result<Vec<Note>, String> {
    Ok(host.list_notes(shelf.as_deref()))
}

#[tauri::command]
async fn get_note(host: State<'_, Host>, id_or_path: String) -> Result<Option<Note>, String> {
    Ok(host.get_note(&id_or_path))
}

#[tauri::command]
async fn upsert_note(host: State<'_, Host>, input: NoteInput) -> Result<Note, String> {
    host.upsert_note(input)
}

#[tauri::command]
async fn delete_note(host: State<'_, Host>, id_or_path: String) -> Result<bool, String> {
    host.delete_note(&id_or_path)
}

#[tauri::command]
async fn list_pending(host: State<'_, Host>) -> Result<Vec<PendingRecord>, String> {
    Ok(host.list_pending())
}

#[tauri::command]
async fn approve_pending(host: State<'_, Host>, id: String) -> Result<PendingRecord, String> {
    host.approve_pending(&id)
}

#[tauri::command]
async fn reject_pending(host: State<'_, Host>, id: String) -> Result<(), String> {
    host.reject_pending(&id)
}

#[tauri::command]
async fn mcp_connect_info(host: State<'_, Host>) -> Result<mcp_connect::McpConnectInfo, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe
        .parent()
        .ok_or_else(|| "cannot resolve executable directory".to_string())?;
    mcp_connect::resolve_mcp_connect_info(dir, &host.status().pack_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let bind: SocketAddr = DEFAULT_HTTP_ADDR.parse()?;
            let pack = default_pack_dir()?;
            let host = tauri::async_runtime::block_on(Host::start(pack, bind))?;
            app.manage(host);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            set_pack_path,
            list_shelves,
            list_notes,
            get_note,
            upsert_note,
            delete_note,
            list_pending,
            approve_pending,
            reject_pending,
            mcp_connect_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    #[test]
    fn ensure_pack_creates_default_shelves() {
        let dir = tempfile::tempdir().unwrap();
        let pack = dir.path().join("personal-os");
        ensure_pack_layout(&pack).unwrap();
        assert!(pack.join("preferences").is_dir());
        for shelf in DEFAULT_SHELVES {
            assert!(pack.join(shelf).is_dir(), "{shelf}");
        }
    }

    #[test]
    fn ensure_pack_keeps_existing_notes() {
        let dir = tempfile::tempdir().unwrap();
        let pack = dir.path().join("personal-os");
        std::fs::create_dir_all(pack.join("work")).unwrap();
        std::fs::write(pack.join("work/keep.md"), "x").unwrap();
        ensure_pack_layout(&pack).unwrap();
        assert_eq!(std::fs::read_to_string(pack.join("work/keep.md")).unwrap(), "x");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn host_serves_health_status_and_switches_pack() {
        let dir = tempfile::tempdir().unwrap();
        let pack_a = dir.path().join("a");
        let host = Host::start(pack_a.clone(), "127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        let status = host.status();
        assert_eq!(status.notes, 0);
        assert_eq!(status.pack_path, pack_a.display().to_string());
        assert!(pack_a.join("goals").is_dir());

        let client = reqwest::Client::new();
        let base = format!("http://{}", status.http_addr);
        let health: Value = client
            .get(format!("{base}/health"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(health, json!({ "ok": true, "notes": 0 }));

        // Write via HTTP into pack A, then switch packs; HTTP now reflects pack B.
        client
            .put(format!("{base}/notes/n1"))
            .json(&json!({ "title": "T", "shelf": "work", "body": "b" }))
            .send()
            .await
            .unwrap();
        assert_eq!(host.status().notes, 1);

        let pack_b = dir.path().join("b");
        let switched = host.set_pack_path(pack_b.to_str().unwrap()).unwrap();
        assert_eq!(switched.notes, 0);
        assert_eq!(switched.pack_path, pack_b.display().to_string());
        let health: Value = client
            .get(format!("{base}/health"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(health["notes"], 0);
        assert!(host.set_pack_path("  ").is_err());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn host_pending_queue_follows_pack_and_http_writes_stay_immediate() {
        let dir = tempfile::tempdir().unwrap();
        let pack_a = dir.path().join("a");
        let host = Host::start(pack_a.clone(), "127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        host.pending()
            .lock()
            .enqueue_delete("whatever")
            .unwrap();
        assert_eq!(host.pending().lock().list().len(), 1);
        assert!(pack_a.join("_meta/pending").is_dir());

        let base = format!("http://{}", host.status().http_addr);
        reqwest::Client::new()
            .put(format!("{base}/notes/n1"))
            .json(&json!({ "title": "T", "shelf": "work", "body": "b" }))
            .send()
            .await
            .unwrap();
        assert!(pack_a.join("work/t.md").exists());
        assert_eq!(host.pending().lock().list().len(), 1);

        let pack_b = dir.path().join("b");
        host.set_pack_path(pack_b.to_str().unwrap()).unwrap();
        assert!(host.pending().lock().list().is_empty());
    }

    fn note_input(title: &str, shelf: &str) -> NoteInput {
        NoteInput {
            id: None,
            title: title.into(),
            shelf: shelf.into(),
            body: "body".into(),
            tags: Some(vec!["t".into()]),
        }
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn host_human_crud_is_immediate_and_filters_by_shelf() {
        let dir = tempfile::tempdir().unwrap();
        let pack = dir.path().join("p");
        let host = Host::start(pack.clone(), "127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        assert!(host.list_shelves().contains(&"work".to_string()));

        let a = host.upsert_note(note_input("Alpha", "work")).unwrap();
        let b = host.upsert_note(note_input("Beta", "goals")).unwrap();
        assert!(pack.join("work/alpha.md").is_file());
        assert!(host.list_pending().is_empty());
        assert_eq!(host.list_notes(None).len(), 2);
        let work = host.list_notes(Some("work"));
        assert_eq!(work.len(), 1);
        assert_eq!(work[0].id, a.id);
        assert_eq!(host.get_note(&b.id).unwrap().title, "Beta");
        assert_eq!(host.get_note("work/alpha.md").unwrap().id, a.id);
        assert!(host.upsert_note(note_input("Bad", "")).is_err());

        assert!(host.delete_note(&a.id).unwrap());
        assert!(!pack.join("work/alpha.md").exists());
        assert!(!host.delete_note(&a.id).unwrap());
        assert!(host.get_note(&a.id).is_none());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn host_pending_actions_see_records_written_by_another_process() {
        let dir = tempfile::tempdir().unwrap();
        let pack = dir.path().join("p");
        let host = Host::start(pack.clone(), "127.0.0.1:0".parse().unwrap())
            .await
            .unwrap();
        assert!(host.list_pending().is_empty());

        // Simulate personal-os-mcp: a separate queue instance writing to the same pack root.
        let mut external = PendingQueue::load(pack.clone());
        let up = external
            .enqueue_upsert(UpsertInput {
                id: None,
                title: "From MCP".into(),
                shelf: "work".into(),
                body: "b".into(),
                tags: Some(vec![]),
                updated: None,
                created: None,
            })
            .unwrap();
        let junk = external.enqueue_delete("note_ghost").unwrap();

        let listed = host.list_pending();
        assert_eq!(listed.len(), 2);

        // Approve applies the note via Store and removes the record from disk.
        let done = host.approve_pending(&up.id).unwrap();
        assert_eq!(done.id, up.id);
        assert!(pack.join("work/from-mcp.md").is_file());
        assert_eq!(host.list_notes(Some("work")).len(), 1);
        assert!(!pack.join(format!("_meta/pending/{}.json", up.id)).exists());

        // A record created after the last list is still rejectable without a prior list.
        let late = external.enqueue_delete("note_late").unwrap();
        host.reject_pending(&late.id).unwrap();
        assert!(!pack.join(format!("_meta/pending/{}.json", late.id)).exists());

        // A record removed externally disappears from the desk's view.
        std::fs::remove_file(pack.join(format!("_meta/pending/{}.json", junk.id))).unwrap();
        assert!(host.list_pending().is_empty());
        assert!(host.approve_pending(&junk.id).is_err());
        assert!(host.reject_pending("pend_missing").is_err());
    }
}
