use crate::pack::{manifest::build_manifest, note::serialize_note, types::Note};
use crate::store::{Result, StoreError};
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};

fn replace_file(tmp: &Path, target: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    if let Err(error) = std::fs::remove_file(target) {
        if error.kind() != ErrorKind::NotFound {
            return Err(error);
        }
    }

    std::fs::rename(tmp, target)
}

/// Resolve `path` under `pack_root`, rejecting anything that could escape it
/// (absolute paths, `..`, `.`, prefixes, empty paths, backslashes).
pub fn confine(pack_root: &Path, path: &str) -> Result<PathBuf> {
    let candidate = Path::new(path);
    let valid = !path.is_empty()
        && !path.contains('\\')
        && !path.contains('\0')
        && candidate
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
    if !valid {
        return Err(StoreError::InvalidPath(path.to_owned()));
    }
    Ok(pack_root.join(candidate))
}

/// Write the note to `{path}.tmp`, then rename into place.
/// Callers are responsible for `write_manifest`.
pub fn write_note_atomic(pack_root: &Path, note: &Note) -> Result<()> {
    let target = confine(pack_root, &note.path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut tmp_name = target
        .file_name()
        .expect("confined path has a file name")
        .to_os_string();
    tmp_name.push(".tmp");
    let tmp = target.with_file_name(tmp_name);
    std::fs::write(&tmp, serialize_note(note))?;
    if let Err(error) = replace_file(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(error.into());
    }
    Ok(())
}

/// Remove a note file; an already-missing file is not an error.
pub fn remove_note_file(pack_root: &Path, path: &str) -> Result<()> {
    let target = confine(pack_root, path)?;
    match std::fs::remove_file(target) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

/// Write `_meta/manifest.json` atomically (same shape/indent as the capture export).
pub fn write_manifest(pack_root: &Path, notes: &[Note]) -> Result<()> {
    let meta = pack_root.join("_meta");
    std::fs::create_dir_all(&meta)?;
    let target = meta.join("manifest.json");
    let tmp = meta.join("manifest.json.tmp");
    let json = serde_json::to_string_pretty(&build_manifest(notes))?;
    std::fs::write(&tmp, json)?;
    if let Err(error) = replace_file(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(error.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replace_file_replaces_an_existing_destination() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("note.md");
        let tmp = dir.path().join("note.md.tmp");
        std::fs::write(&target, "old").unwrap();
        std::fs::write(&tmp, "new").unwrap();

        replace_file(&tmp, &target).unwrap();

        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new");
        assert!(!tmp.exists());
    }

    #[test]
    fn confine_rejects_escapes() {
        let root = Path::new("/tmp/pack");
        for bad in [
            "../x.md",
            "a/../../x.md",
            "/etc/passwd",
            "",
            "./a.md",
            "a\\b.md",
        ] {
            assert!(confine(root, bad).is_err(), "{bad}");
        }
        assert_eq!(
            confine(root, "goals/a.md").unwrap(),
            root.join("goals/a.md")
        );
    }
}
