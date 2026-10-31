pub mod fs_write;
pub mod http;
pub mod mcp;
pub mod pack;
pub mod store;
pub mod sync;
pub mod watch;

use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use store::Store;
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

/// Running host services: shared store, HTTP server, and the pack watcher.
pub struct Host {
    store: Arc<RwLock<Store>>,
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
            pack_path: Mutex::new(pack),
            watcher: Mutex::new(watcher),
            http,
            http_addr,
        })
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
        *self.store.write() = fresh;
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
        .invoke_handler(tauri::generate_handler![get_status, set_pack_path])
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
}
