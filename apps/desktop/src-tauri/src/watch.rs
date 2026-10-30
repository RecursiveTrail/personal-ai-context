//! Filesystem watcher: debounced full reload of the shared store when the pack changes on disk.

use crate::store::Store;
use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use parking_lot::RwLock;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinHandle;

/// Quiet period before a burst of filesystem events triggers a reload (must stay >= 200ms).
pub const DEBOUNCE: Duration = Duration::from_millis(250);

/// Watch `pack_root` recursively and fully reload `store` after each debounced burst.
///
/// Must be called inside a tokio runtime. Aborting the returned handle drops the debouncer
/// and stops watching. If the watcher cannot start, the error is logged and the task ends.
pub fn spawn_watcher(pack_root: PathBuf, store: Arc<RwLock<Store>>) -> JoinHandle<()> {
    tokio::spawn(async move {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let mut debouncer = match new_debouncer(DEBOUNCE, move |result| {
            let _ = tx.send(result);
        }) {
            Ok(debouncer) => debouncer,
            Err(error) => {
                eprintln!("watcher: failed to start: {error}");
                return;
            }
        };
        if let Err(error) = debouncer
            .watcher()
            .watch(&pack_root, RecursiveMode::Recursive)
        {
            eprintln!("watcher: cannot watch {}: {error}", pack_root.display());
            return;
        }
        while let Some(result) = rx.recv().await {
            match result {
                Ok(_) => {
                    if let Err(error) = store.write().reload() {
                        eprintln!("watcher: reload failed: {error}");
                    }
                }
                Err(error) => eprintln!("watcher: {error}"),
            }
        }
        // `debouncer` is held until the channel closes or the task is aborted.
        drop(debouncer);
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn external_write_triggers_reload() {
        let dir = tempfile::tempdir().unwrap();
        let pack = dir.path().join("personal-os");
        std::fs::create_dir_all(pack.join("preferences")).unwrap();
        let store = Arc::new(RwLock::new(Store::load(pack.clone()).unwrap()));
        let handle = spawn_watcher(pack.clone(), store.clone());
        tokio::time::sleep(Duration::from_millis(300)).await;

        std::fs::write(
            pack.join("preferences/dark.md"),
            "---\nid: n_dark\ntitle: Dark mode\nshelf: preferences\ntags: []\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n\nPrefer dark mode.\n",
        )
        .unwrap();

        let deadline = Instant::now() + Duration::from_secs(5);
        while store.read().note_count() == 0 && Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        handle.abort();
        assert_eq!(store.read().note_count(), 1);
    }
}
