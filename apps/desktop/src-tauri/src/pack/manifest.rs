use super::types::Note;
pub use super::types::{Manifest, ManifestEntry};

/// Mirrors `buildManifest` in `packages/pack-core/src/manifest.ts`.
pub fn build_manifest(notes: &[Note]) -> Manifest {
    Manifest {
        version: 1,
        notes: notes
            .iter()
            .map(|note| ManifestEntry {
                id: note.id.clone(),
                path: note.path.clone(),
                shelf: note.shelf.clone(),
                title: note.title.clone(),
                updated: note.updated.clone(),
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_version_one_manifest_with_entry_fields() {
        let note = Note {
            id: "note_a".into(),
            title: "Alpha".into(),
            shelf: "goals".into(),
            tags: vec!["x".into()],
            created: "c".into(),
            updated: "u".into(),
            body: "b".into(),
            path: "goals/alpha.md".into(),
        };
        let manifest = build_manifest(&[note]);
        assert_eq!(manifest.version, 1);
        assert_eq!(manifest.notes.len(), 1);
        assert_eq!(manifest.notes[0].path, "goals/alpha.md");
        assert_eq!(manifest.notes[0].updated, "u");
    }
}
