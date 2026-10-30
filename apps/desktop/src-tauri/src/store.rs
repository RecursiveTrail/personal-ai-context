use crate::fs_write::{remove_note_file, write_manifest, write_note_atomic};
use crate::pack::{
    new_note_id, parse_note,
    search::search_notes,
    serialize_note, slugify_title,
    types::{Note, SearchHit},
};
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use thiserror::Error;

const META_DIR: &str = "_meta";

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("pack path missing or unreadable: {0}")]
    PackUnreadable(String),
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, StoreError>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpsertInput {
    pub id: Option<String>,
    pub title: String,
    pub shelf: String,
    pub body: String,
    pub tags: Option<Vec<String>>,
    /// When `Some`, honored as-is (HTTP/sync); `None` stamps the current time.
    pub updated: Option<String>,
}

#[derive(Debug)]
pub struct Store {
    pack_root: PathBuf,
    notes: HashMap<String, Note>,
    shelves: BTreeSet<String>,
}

fn now_iso() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

fn validate_shelf(shelf: &str) -> Result<()> {
    let bad = shelf.trim().is_empty()
        || shelf != shelf.trim()
        || shelf.starts_with('.')
        || shelf == META_DIR
        || shelf.contains(['/', '\\', '\0']);
    if bad {
        return Err(StoreError::InvalidInput(format!(
            "invalid shelf: {shelf:?}"
        )));
    }
    Ok(())
}

/// Scan `pack_root` like Node `loadPackFromDir`: immediate non-hidden, non-`_meta`
/// directories are shelves; immediate `*.md` files are notes. Bad notes are logged and skipped.
fn scan(pack_root: &Path) -> Result<(HashMap<String, Note>, BTreeSet<String>)> {
    let entries = std::fs::read_dir(pack_root)
        .map_err(|e| StoreError::PackUnreadable(format!("{} ({e})", pack_root.display())))?;
    let mut notes = HashMap::new();
    let mut shelves = BTreeSet::new();
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name == META_DIR || name.starts_with('.') {
            continue;
        }
        let shelf_path = entry.path();
        if !shelf_path.is_dir() {
            continue;
        }
        let files = match std::fs::read_dir(&shelf_path) {
            Ok(files) => files,
            Err(error) => {
                eprintln!("{name}: {error}");
                continue;
            }
        };
        shelves.insert(name.clone());
        for file in files.flatten() {
            let file_name = file.file_name().to_string_lossy().into_owned();
            // Match the Node loader: every immediate Markdown file is a note candidate.
            if !file_name.ends_with(".md") {
                continue;
            }
            let rel = format!("{name}/{file_name}");
            let parsed = std::fs::read_to_string(file.path())
                .map_err(|e| e.to_string())
                .and_then(|raw| parse_note(&raw, &rel).map_err(|e| e.to_string()));
            match parsed {
                Ok(note) => {
                    shelves.insert(note.shelf.clone());
                    notes.insert(note.id.clone(), note);
                }
                Err(error) => eprintln!("{rel}: {error}"),
            }
        }
    }
    Ok((notes, shelves))
}

impl Store {
    pub fn load(pack_root: PathBuf) -> Result<Self> {
        let (notes, shelves) = scan(&pack_root)?;
        Ok(Self {
            pack_root,
            notes,
            shelves,
        })
    }

    pub fn reload(&mut self) -> Result<()> {
        let (notes, shelves) = scan(&self.pack_root)?;
        self.notes = notes;
        self.shelves = shelves;
        Ok(())
    }

    pub fn list_shelves(&self) -> Vec<String> {
        self.shelves.iter().cloned().collect()
    }

    pub fn note_count(&self) -> usize {
        self.notes.len()
    }

    /// All notes, ordered by path for deterministic output.
    pub fn all_notes(&self) -> Vec<Note> {
        let mut notes: Vec<Note> = self.notes.values().cloned().collect();
        notes.sort_by(|a, b| a.path.cmp(&b.path));
        notes
    }

    pub fn get_note(&self, id_or_path: &str) -> Option<Note> {
        self.find_id(id_or_path)
            .and_then(|id| self.notes.get(&id).cloned())
    }

    pub fn search(&self, query: &str, shelf: Option<&str>) -> Vec<SearchHit> {
        search_notes(&self.all_notes(), query, shelf)
    }

    fn find_id(&self, id_or_path: &str) -> Option<String> {
        if self.notes.contains_key(id_or_path) {
            return Some(id_or_path.to_owned());
        }
        self.notes
            .values()
            .find(|note| note.path == id_or_path)
            .map(|note| note.id.clone())
    }

    fn unique_path(&self, shelf: &str, title: &str, own_id: Option<&str>) -> String {
        let slug = slugify_title(title);
        let taken = |path: &str| {
            self.notes
                .values()
                .any(|note| Some(note.id.as_str()) != own_id && note.path == path)
                || self.pack_root.join(path).exists()
                    && !own_id
                        .and_then(|id| self.notes.get(id))
                        .is_some_and(|note| note.path == path)
        };
        let mut candidate = format!("{shelf}/{slug}.md");
        let mut counter = 2;
        while taken(&candidate) {
            candidate = format!("{shelf}/{slug}-{counter}.md");
            counter += 1;
        }
        candidate
    }

    pub(crate) fn validate_upsert_input(input: &UpsertInput) -> Result<()> {
        if input.title.trim().is_empty() {
            return Err(StoreError::InvalidInput("title must not be empty".into()));
        }
        if input.id.as_ref().is_some_and(|id| id.is_empty()) {
            return Err(StoreError::InvalidInput("id must not be empty".into()));
        }
        validate_shelf(&input.shelf)
    }

    pub fn upsert_note(&mut self, input: UpsertInput) -> Result<Note> {
        Self::validate_upsert_input(&input)?;
        let existing = input
            .id
            .as_deref()
            .and_then(|id| self.notes.get(id))
            .cloned();
        let updated = input.updated.clone().unwrap_or_else(now_iso);

        let note = match &existing {
            Some(old) => {
                let path = if old.shelf == input.shelf && old.title == input.title {
                    old.path.clone()
                } else {
                    self.unique_path(&input.shelf, &input.title, Some(&old.id))
                };
                Note {
                    id: old.id.clone(),
                    title: input.title,
                    shelf: input.shelf,
                    tags: input.tags.unwrap_or_else(|| old.tags.clone()),
                    created: old.created.clone(),
                    updated,
                    body: input.body,
                    path,
                }
            }
            None => {
                let id = input.id.clone().unwrap_or_else(new_note_id);
                let path = self.unique_path(&input.shelf, &input.title, None);
                Note {
                    id,
                    title: input.title,
                    shelf: input.shelf,
                    tags: input.tags.unwrap_or_default(),
                    created: updated.clone(),
                    updated,
                    body: input.body,
                    path,
                }
            }
        };

        // Normalize through serialize/parse so memory matches what a reload reads from disk.
        let note = parse_note(&serialize_note(&note), &note.path)
            .map_err(|e| StoreError::InvalidInput(e.to_string()))?;
        write_note_atomic(&self.pack_root, &note)?;
        if let Some(old) = &existing {
            if old.path != note.path {
                remove_note_file(&self.pack_root, &old.path)?;
            }
        }
        self.shelves.insert(note.shelf.clone());
        self.notes.insert(note.id.clone(), note.clone());
        write_manifest(&self.pack_root, &self.all_notes())?;
        Ok(note)
    }

    pub fn delete_note(&mut self, id_or_path: &str) -> Result<bool> {
        let Some(id) = self.find_id(id_or_path) else {
            return Ok(false);
        };
        let path = self.notes[&id].path.clone();
        remove_note_file(&self.pack_root, &path)?;
        self.notes.remove(&id);
        write_manifest(&self.pack_root, &self.all_notes())?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../fixtures/personal-os")
    }

    fn input(title: &str, shelf: &str) -> UpsertInput {
        UpsertInput {
            id: None,
            title: title.into(),
            shelf: shelf.into(),
            body: "body".into(),
            tags: None,
            updated: None,
        }
    }

    fn empty_pack() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let pack = dir.path().join("personal-os");
        std::fs::create_dir_all(pack.join("preferences")).unwrap();
        (dir, pack)
    }

    #[tokio::test]
    async fn load_fixture_pack_lists_shelves_and_gets_note() {
        let store = Store::load(fixture_root()).unwrap();
        let shelves = store.list_shelves();
        assert!(shelves.iter().any(|s| s == "preferences"));
        let note = store.get_note("note_pref_short").unwrap();
        assert_eq!(note.title, "Prefer short answers");
        assert!(store
            .get_note("preferences/prefer-short-answers.md")
            .is_some());
        assert!(!shelves.iter().any(|s| s == "_meta"));
        assert_eq!(store.note_count(), 6);
        assert_eq!(store.search("short", None)[0].id, "note_pref_short");
    }

    #[test]
    fn upsert_creates_file_and_delete_removes_it() {
        let (_dir, pack) = empty_pack();
        let mut store = Store::load(pack.clone()).unwrap();
        let note = store.upsert_note(input("New Pref", "preferences")).unwrap();
        assert_eq!(note.path, "preferences/new-pref.md");
        assert!(pack.join(&note.path).is_file());
        assert!(pack.join("_meta/manifest.json").is_file());
        assert!(store.delete_note(&note.id).unwrap());
        assert!(!pack.join(&note.path).exists());
        assert!(!store.delete_note(&note.id).unwrap());
        let manifest: crate::pack::manifest::Manifest = serde_json::from_str(
            &std::fs::read_to_string(pack.join("_meta/manifest.json")).unwrap(),
        )
        .unwrap();
        assert!(manifest.notes.is_empty());
    }

    #[test]
    fn colliding_titles_get_numeric_suffix() {
        let (_dir, pack) = empty_pack();
        let mut store = Store::load(pack).unwrap();
        let a = store.upsert_note(input("Same", "preferences")).unwrap();
        let b = store.upsert_note(input("Same", "preferences")).unwrap();
        let c = store.upsert_note(input("Same", "preferences")).unwrap();
        assert_eq!(a.path, "preferences/same.md");
        assert_eq!(b.path, "preferences/same-2.md");
        assert_eq!(c.path, "preferences/same-3.md");
    }

    #[test]
    fn update_moves_file_when_title_or_shelf_changes() {
        let (_dir, pack) = empty_pack();
        let mut store = Store::load(pack.clone()).unwrap();
        let first = store.upsert_note(input("Old", "preferences")).unwrap();
        let mut change = input("Newer", "goals");
        change.id = Some(first.id.clone());
        change.updated = Some("2030-01-01T00:00:00.000Z".into());
        let moved = store.upsert_note(change).unwrap();
        assert_eq!(moved.id, first.id);
        assert_eq!(moved.created, first.created);
        assert_eq!(moved.updated, "2030-01-01T00:00:00.000Z");
        assert_eq!(moved.path, "goals/newer.md");
        assert!(!pack.join(&first.path).exists());
        assert!(pack.join("goals/newer.md").is_file());
        assert_eq!(store.note_count(), 1);
        assert!(store.list_shelves().contains(&"goals".to_string()));
        // reload from disk matches memory
        let mut other = Store::load(pack).unwrap();
        assert_eq!(other.get_note(&first.id).unwrap(), moved);
        other.reload().unwrap();
        assert_eq!(other.note_count(), 1);
    }

    #[test]
    fn update_same_title_keeps_path_and_refreshes_updated() {
        let (_dir, pack) = empty_pack();
        let mut store = Store::load(pack).unwrap();
        let first = store.upsert_note(input("Keep", "preferences")).unwrap();
        let mut again = input("Keep", "preferences");
        again.id = Some(first.id.clone());
        again.body = "changed".into();
        let second = store.upsert_note(again).unwrap();
        assert_eq!(second.path, first.path);
        assert_eq!(second.body, "changed\n");
        assert_eq!(store.note_count(), 1);
    }

    #[test]
    fn rejects_bad_shelf_and_empty_title() {
        let (_dir, pack) = empty_pack();
        let mut store = Store::load(pack).unwrap();
        for shelf in ["../x", "a/b", "", "_meta", ".hidden", "/abs"] {
            assert!(store.upsert_note(input("T", shelf)).is_err(), "{shelf}");
        }
        assert!(store.upsert_note(input("  ", "preferences")).is_err());
    }

    #[test]
    fn load_skips_bad_notes_and_keeps_empty_shelves() {
        let (_dir, pack) = empty_pack();
        std::fs::create_dir_all(pack.join("empty")).unwrap();
        std::fs::create_dir_all(pack.join(".git")).unwrap();
        std::fs::write(pack.join("preferences/bad.md"), "no frontmatter").unwrap();
        std::fs::write(pack.join("preferences/._x.md"), "junk").unwrap();
        std::fs::write(pack.join("preferences/readme.txt"), "x").unwrap();
        let store = Store::load(pack).unwrap();
        assert_eq!(store.note_count(), 0);
        assert_eq!(store.list_shelves(), vec!["empty", "preferences"]);
    }

    #[test]
    fn load_includes_parseable_dot_prefixed_markdown_files() {
        let (_dir, pack) = empty_pack();
        let note = Note {
            id: "note_private".into(),
            title: "Private".into(),
            shelf: "preferences".into(),
            tags: vec![],
            created: "2026-01-01T00:00:00.000Z".into(),
            updated: "2026-01-01T00:00:00.000Z".into(),
            body: "Loaded from a dot-prefixed file.".into(),
            path: "preferences/.private.md".into(),
        };
        std::fs::write(pack.join("preferences/.private.md"), serialize_note(&note)).unwrap();

        let store = Store::load(pack).unwrap();

        assert_eq!(store.get_note("note_private").unwrap().path, note.path);
    }

    #[test]
    fn missing_pack_root_errors() {
        assert!(Store::load(PathBuf::from("/nonexistent/pack/root")).is_err());
    }
}
