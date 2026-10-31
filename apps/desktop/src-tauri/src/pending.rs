//! Durable queue of MCP write requests awaiting human approval.
//! Records live at `_meta/pending/<id>.json` and are ignored by the note scanner.

use crate::pack::{new_note_id, slugify_title, types::Note};
use crate::store::{Store, StoreError, UpsertInput};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PendingError {
    #[error("pending record not found: {0}")]
    NotFound(String),
    #[error("note not found: {0}")]
    NoteNotFound(String),
    #[error("invalid pending record: {0}")]
    Invalid(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Store(#[from] StoreError),
}

pub type Result<T> = std::result::Result<T, PendingError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PendingOp {
    Upsert,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingRecord {
    pub id: String,
    pub op: PendingOp,
    pub created_at: String,
    pub source: String,
    pub note: Option<Note>,
    pub target_id_or_path: Option<String>,
    pub status: String,
}

#[derive(Debug)]
pub struct PendingQueue {
    pack_root: PathBuf,
    records: Vec<PendingRecord>,
}

const PENDING_DIR: &str = "_meta/pending";
const SOURCE_MCP: &str = "mcp";

fn now_iso() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

fn new_pending_id() -> String {
    let hex = uuid::Uuid::new_v4().simple().to_string();
    format!("pend_{}", &hex[..12])
}

impl PendingQueue {
    /// Read `_meta/pending/*.json`. Corrupt or unreadable records are logged and skipped.
    pub fn load(pack_root: PathBuf) -> Self {
        let dir = pack_root.join(PENDING_DIR);
        let mut records = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with('.') || !name.ends_with(".json") {
                    continue;
                }
                let parsed = std::fs::read_to_string(entry.path())
                    .map_err(|e| e.to_string())
                    .and_then(|raw| {
                        serde_json::from_str::<PendingRecord>(&raw).map_err(|e| e.to_string())
                    });
                match parsed {
                    Ok(record) if format!("{}.json", record.id) == name => records.push(record),
                    Ok(_) => eprintln!("pending/{name}: id does not match file name; skipped"),
                    Err(error) => eprintln!("pending/{name}: {error}; skipped"),
                }
            }
        }
        sort_records(&mut records);
        Self { pack_root, records }
    }

    fn record_path(&self, id: &str) -> PathBuf {
        self.pack_root.join(PENDING_DIR).join(format!("{id}.json"))
    }

    fn persist(&mut self, record: PendingRecord) -> Result<PendingRecord> {
        let dir = self.pack_root.join(PENDING_DIR);
        std::fs::create_dir_all(&dir)?;
        let target = self.record_path(&record.id);
        let tmp = dir.join(format!("{}.json.tmp", record.id));
        std::fs::write(&tmp, serde_json::to_string_pretty(&record)?)?;
        std::fs::rename(&tmp, &target)?;
        self.records.push(record.clone());
        sort_records(&mut self.records);
        Ok(record)
    }

    /// Queue a note write. The note is fully materialized (id, timestamps, path) but not applied.
    pub fn enqueue_upsert(&mut self, input: UpsertInput) -> Result<PendingRecord> {
        if input.title.trim().is_empty() {
            return Err(PendingError::Invalid("title must not be empty".into()));
        }
        if input.shelf.trim().is_empty() {
            return Err(PendingError::Invalid("shelf must not be empty".into()));
        }
        let now = now_iso();
        let updated = input.updated.unwrap_or_else(|| now.clone());
        let note = Note {
            id: input.id.unwrap_or_else(new_note_id),
            path: format!("{}/{}.md", input.shelf, slugify_title(&input.title)),
            title: input.title,
            shelf: input.shelf,
            tags: input.tags.unwrap_or_default(),
            created: input.created.unwrap_or_else(|| updated.clone()),
            updated,
            body: input.body,
        };
        self.persist(PendingRecord {
            id: new_pending_id(),
            op: PendingOp::Upsert,
            created_at: now,
            source: SOURCE_MCP.into(),
            note: Some(note),
            target_id_or_path: None,
            status: "pending".into(),
        })
    }

    /// Queue a note deletion by id or pack-relative path.
    pub fn enqueue_delete(&mut self, id_or_path: &str) -> Result<PendingRecord> {
        if id_or_path.trim().is_empty() {
            return Err(PendingError::Invalid("idOrPath must not be empty".into()));
        }
        self.persist(PendingRecord {
            id: new_pending_id(),
            op: PendingOp::Delete,
            created_at: now_iso(),
            source: SOURCE_MCP.into(),
            note: None,
            target_id_or_path: Some(id_or_path.to_string()),
            status: "pending".into(),
        })
    }

    pub fn list(&self) -> Vec<PendingRecord> {
        self.records.clone()
    }

    /// Apply the record to `store`, then drop it. On failure the record stays queued.
    pub fn approve(&mut self, id: &str, store: &mut Store) -> Result<PendingRecord> {
        let record = self.find(id)?.clone();
        match record.op {
            PendingOp::Upsert => {
                let note = record
                    .note
                    .as_ref()
                    .ok_or_else(|| PendingError::Invalid(format!("{id}: upsert without note")))?;
                store.upsert_note(UpsertInput {
                    id: Some(note.id.clone()),
                    title: note.title.clone(),
                    shelf: note.shelf.clone(),
                    body: note.body.clone(),
                    tags: Some(note.tags.clone()),
                    // Stamp approval time; `created` is honored only for new notes.
                    updated: None,
                    created: Some(note.created.clone()),
                })?;
            }
            PendingOp::Delete => {
                let target = record.target_id_or_path.as_deref().ok_or_else(|| {
                    PendingError::Invalid(format!("{id}: delete without target"))
                })?;
                if !store.delete_note(target)? {
                    return Err(PendingError::NoteNotFound(target.to_string()));
                }
            }
        }
        self.remove(id)?;
        Ok(record)
    }

    /// Drop the record without touching the pack.
    pub fn reject(&mut self, id: &str) -> Result<()> {
        self.find(id)?;
        self.remove(id)
    }

    fn find(&self, id: &str) -> Result<&PendingRecord> {
        self.records
            .iter()
            .find(|r| r.id == id)
            .ok_or_else(|| PendingError::NotFound(id.to_string()))
    }

    fn remove(&mut self, id: &str) -> Result<()> {
        match std::fs::remove_file(self.record_path(id)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
        self.records.retain(|r| r.id != id);
        Ok(())
    }
}

fn sort_records(records: &mut [PendingRecord]) {
    records.sort_by(|a, b| a.created_at.cmp(&b.created_at).then_with(|| a.id.cmp(&b.id)));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, PathBuf, Store) {
        let dir = tempfile::tempdir().unwrap();
        let pack = dir.path().join("personal-os");
        std::fs::create_dir_all(pack.join("preferences")).unwrap();
        let store = Store::load(pack.clone()).unwrap();
        (dir, pack, store)
    }

    fn input(title: &str) -> UpsertInput {
        UpsertInput {
            id: None,
            title: title.into(),
            shelf: "preferences".into(),
            body: "body".into(),
            tags: Some(vec!["a".into()]),
            updated: None,
            created: None,
        }
    }

    fn pending_file(pack: &std::path::Path, id: &str) -> PathBuf {
        pack.join("_meta/pending").join(format!("{id}.json"))
    }

    #[test]
    fn enqueue_upsert_writes_durable_record_without_touching_store() {
        let (_d, pack, store) = setup();
        let mut q = PendingQueue::load(pack.clone());
        let rec = q.enqueue_upsert(input("Queued")).unwrap();
        assert!(rec.id.starts_with("pend_"));
        let hex = &rec.id["pend_".len()..];
        assert_eq!(hex.len(), 12);
        assert!(hex.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(rec.op, PendingOp::Upsert);
        assert_eq!(rec.source, "mcp");
        assert_eq!(rec.status, "pending");
        let note = rec.note.as_ref().unwrap();
        assert_eq!(note.title, "Queued");
        assert_eq!(note.path, "preferences/queued.md");
        assert!(pending_file(&pack, &rec.id).is_file());
        assert!(!pack.join("preferences/queued.md").exists());
        assert_eq!(store.note_count(), 0);

        let json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(pending_file(&pack, &rec.id)).unwrap())
                .unwrap();
        assert_eq!(json["op"], "upsert");
        assert!(json["createdAt"].is_string());
        assert!(json["targetIdOrPath"].is_null());
    }

    #[test]
    fn enqueue_delete_records_target() {
        let (_d, pack, _s) = setup();
        let mut q = PendingQueue::load(pack.clone());
        let rec = q.enqueue_delete("note_x").unwrap();
        assert_eq!(rec.op, PendingOp::Delete);
        assert_eq!(rec.target_id_or_path.as_deref(), Some("note_x"));
        assert!(rec.note.is_none());
        assert!(pending_file(&pack, &rec.id).is_file());
        assert!(q.enqueue_delete("  ").is_err());
    }

    #[test]
    fn list_returns_records_and_survives_reload_skipping_corrupt() {
        let (_d, pack, _s) = setup();
        let mut q = PendingQueue::load(pack.clone());
        let a = q.enqueue_upsert(input("A")).unwrap();
        let b = q.enqueue_delete("note_b").unwrap();
        assert_eq!(q.list().len(), 2);
        std::fs::write(pack.join("_meta/pending/pend_bad.json"), "{nope").unwrap();
        std::fs::write(pack.join("_meta/pending/._junk.json"), "junk").unwrap();
        let q2 = PendingQueue::load(pack);
        let ids: Vec<_> = q2.list().into_iter().map(|r| r.id).collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&a.id) && ids.contains(&b.id));
    }

    #[test]
    fn approve_upsert_writes_note_and_removes_file() {
        let (_d, pack, mut store) = setup();
        let mut q = PendingQueue::load(pack.clone());
        let rec = q.enqueue_upsert(input("Approved")).unwrap();
        let note_id = rec.note.as_ref().unwrap().id.clone();
        let done = q.approve(&rec.id, &mut store).unwrap();
        assert_eq!(done.id, rec.id);
        assert!(pack.join("preferences/approved.md").is_file());
        assert_eq!(store.get_note(&note_id).unwrap().title, "Approved");
        assert!(!pending_file(&pack, &rec.id).exists());
        assert!(q.list().is_empty());
    }

    #[test]
    fn reject_removes_file_and_leaves_pack_unchanged() {
        let (_d, pack, mut store) = setup();
        let mut q = PendingQueue::load(pack.clone());
        let rec = q.enqueue_upsert(input("Nope")).unwrap();
        q.reject(&rec.id).unwrap();
        assert!(!pending_file(&pack, &rec.id).exists());
        assert!(q.list().is_empty());
        assert_eq!(store.note_count(), 0);
        assert!(!pack.join("preferences/nope.md").exists());
        assert!(matches!(q.reject(&rec.id), Err(PendingError::NotFound(_))));
        assert!(matches!(
            q.approve(&rec.id, &mut store),
            Err(PendingError::NotFound(_))
        ));
    }

    #[test]
    fn approve_delete_removes_note_and_missing_target_stays_pending() {
        let (_d, pack, mut store) = setup();
        let note = store.upsert_note(input("Doomed")).unwrap();
        let mut q = PendingQueue::load(pack.clone());
        let rec = q.enqueue_delete(&note.id).unwrap();
        q.approve(&rec.id, &mut store).unwrap();
        assert!(store.get_note(&note.id).is_none());
        assert!(!pack.join(&note.path).exists());
        assert!(!pending_file(&pack, &rec.id).exists());

        let missing = q.enqueue_delete("note_ghost").unwrap();
        assert!(matches!(
            q.approve(&missing.id, &mut store),
            Err(PendingError::NoteNotFound(_))
        ));
        assert!(pending_file(&pack, &missing.id).is_file());
        assert_eq!(q.list().len(), 1);
    }
}
