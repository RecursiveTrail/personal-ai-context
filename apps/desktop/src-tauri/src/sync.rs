//! Additive note-batch synchronization using last-write-wins timestamps.
//!
//! Server-only notes remain: deletes made while offline are not propagated
//! automatically and require an explicit delete API call once online.

use crate::pack::types::Note;
use crate::store::{Result, Store, StoreError, UpsertInput};
use chrono::{DateTime, Utc};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncResult {
    pub notes: Vec<Note>,
    pub applied: usize,
    pub kept_server: usize,
}

pub fn apply_sync(store: &mut Store, incoming: Vec<Note>) -> Result<SyncResult> {
    let mut applied = 0;
    let mut kept_server = 0;

    let mut latest = HashMap::<String, DateTime<Utc>>::new();
    let mut decisions = Vec::with_capacity(incoming.len());
    for note in &incoming {
        let input = upsert_input(note.clone());
        Store::validate_upsert_input(&input)?;
        let incoming_updated = parse_updated(&note.updated)?;
        if !latest.contains_key(&note.id) {
            if let Some(server) = store.get_note(&note.id) {
                latest.insert(note.id.clone(), parse_updated(&server.updated)?);
            }
        }
        let should_apply = latest
            .get(&note.id)
            .is_none_or(|server_updated| incoming_updated >= *server_updated);
        if should_apply {
            latest.insert(note.id.clone(), incoming_updated);
        }
        decisions.push(should_apply);
    }

    for (note, should_apply) in incoming.into_iter().zip(decisions) {
        if should_apply {
            store.upsert_note(upsert_input(note))?;
            applied += 1;
        } else {
            kept_server += 1;
        }
    }

    Ok(SyncResult {
        notes: store.all_notes(),
        applied,
        kept_server,
    })
}

fn upsert_input(note: Note) -> UpsertInput {
    UpsertInput {
        id: Some(note.id),
        title: note.title,
        shelf: note.shelf,
        body: note.body,
        tags: Some(note.tags),
        updated: Some(note.updated),
    }
}

fn parse_updated(updated: &str) -> Result<DateTime<Utc>> {
    updated.parse::<DateTime<Utc>>().map_err(|error| {
        StoreError::InvalidInput(format!("invalid updated timestamp {updated:?}: {error}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{Store, UpsertInput};

    fn empty_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let pack = dir.path().join("personal-os");
        std::fs::create_dir_all(pack.join("preferences")).unwrap();
        let store = Store::load(pack).unwrap();
        (dir, store)
    }

    fn note_input(id: &str, title: &str, updated: &str) -> UpsertInput {
        UpsertInput {
            id: Some(id.into()),
            title: title.into(),
            shelf: "preferences".into(),
            body: title.to_lowercase(),
            tags: None,
            updated: Some(updated.into()),
        }
    }

    #[test]
    fn last_write_wins_by_updated() {
        let (_dir, mut store) = empty_store();
        let older = store
            .upsert_note(note_input(
                "note_abc123456789",
                "Server",
                "2026-01-01T00:00:00.000Z",
            ))
            .unwrap();
        let mut client = older;
        client.title = "Client".into();
        client.body = "client".into();
        client.updated = "2026-02-01T00:00:00.000Z".into();

        let result = apply_sync(&mut store, vec![client]).unwrap();

        assert_eq!(store.get_note("note_abc123456789").unwrap().title, "Client");
        assert_eq!(result.applied, 1);
        assert_eq!(result.kept_server, 0);
    }

    #[test]
    fn keeps_newer_server_note_and_server_only_notes() {
        let (_dir, mut store) = empty_store();
        let newer = store
            .upsert_note(note_input(
                "note_shared",
                "Server",
                "2026-02-01T00:00:00.000Z",
            ))
            .unwrap();
        store
            .upsert_note(note_input(
                "note_server_only",
                "Server only",
                "2026-01-01T00:00:00.000Z",
            ))
            .unwrap();
        let mut client = newer;
        client.title = "Client".into();
        client.updated = "2026-01-01T00:00:00.000Z".into();

        let result = apply_sync(&mut store, vec![client]).unwrap();

        assert_eq!(store.get_note("note_shared").unwrap().title, "Server");
        assert!(store.get_note("note_server_only").is_some());
        assert_eq!(result.applied, 0);
        assert_eq!(result.kept_server, 1);
        assert_eq!(result.notes.len(), 2);
    }

    #[test]
    fn inserts_missing_notes_and_prefers_incoming_on_equal_timestamp() {
        let (_dir, mut store) = empty_store();
        let server = store
            .upsert_note(note_input(
                "note_equal",
                "Server",
                "2026-01-01T00:00:00.000Z",
            ))
            .unwrap();
        let mut equal_client = server;
        equal_client.title = "Client".into();
        equal_client.updated = "2026-01-01T00:00:00.000Z".into();
        let missing = crate::pack::types::Note {
            id: "note_missing".into(),
            title: "Missing".into(),
            shelf: "preferences".into(),
            tags: vec!["new".into()],
            created: "2025-12-01T00:00:00.000Z".into(),
            updated: "2026-03-01T00:00:00.000Z".into(),
            body: "incoming".into(),
            path: "preferences/client-path.md".into(),
        };

        let result = apply_sync(&mut store, vec![equal_client, missing]).unwrap();

        assert_eq!(store.get_note("note_equal").unwrap().title, "Client");
        let inserted = store.get_note("note_missing").unwrap();
        assert_eq!(inserted.updated, "2026-03-01T00:00:00.000Z");
        assert_eq!(inserted.tags, vec!["new"]);
        assert_eq!(result.applied, 2);
        assert_eq!(result.kept_server, 0);
    }
}
