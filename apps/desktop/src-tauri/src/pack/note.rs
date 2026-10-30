use super::types::Note;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PackError {
    #[error("invalid note {path}: {message}")]
    InvalidNote { path: String, message: String },
}

pub fn new_note_id() -> String {
    let hex = Uuid::new_v4().simple().to_string();
    format!("note_{}", &hex[..12])
}

pub fn slugify_title(title: &str) -> String {
    let mut slug = String::new();
    let mut needs_separator = false;

    for character in title.to_lowercase().trim().chars() {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            if needs_separator && !slug.is_empty() {
                slug.push('-');
            }
            slug.push(character);
            needs_separator = false;
        } else {
            needs_separator = true;
        }
    }

    slug.truncate(slug.len().min(80));
    if slug.is_empty() {
        "note".to_owned()
    } else {
        slug
    }
}

pub fn serialize_note(note: &Note) -> String {
    let mut lines = vec![
        "---".to_owned(),
        format!("id: {}", note.id),
        format!(
            "title: {}",
            serde_json::to_string(&note.title).expect("serializing a string cannot fail")
        ),
        format!("shelf: {}", note.shelf),
    ];

    if note.tags.is_empty() {
        lines.push("tags: []".to_owned());
    } else {
        lines.push("tags:".to_owned());
        lines.extend(note.tags.iter().map(|tag| {
            format!(
                "  - {}",
                serde_json::to_string(tag).expect("serializing a string cannot fail")
            )
        }));
    }

    lines.extend([
        format!("created: {}", note.created),
        format!("updated: {}", note.updated),
        "---".to_owned(),
        String::new(),
        note.body.trim_end().to_owned(),
        String::new(),
    ]);
    lines.join("\n")
}

pub fn parse_note(markdown: &str, path: &str) -> Result<Note, PackError> {
    let markdown = markdown
        .strip_prefix("---\n")
        .or_else(|| markdown.strip_prefix("---\r\n"))
        .ok_or_else(|| invalid(path, "missing opening frontmatter delimiter"))?;
    let (frontmatter, body) = markdown
        .split_once("\n---")
        .ok_or_else(|| invalid(path, "missing closing frontmatter delimiter"))?;
    let body = body
        .strip_prefix("\r\n")
        .or_else(|| body.strip_prefix('\n'))
        .or_else(|| body.strip_prefix('\r'))
        .unwrap_or(body);
    let body = body.strip_prefix('\n').unwrap_or(body).to_owned();

    let mut id = None;
    let mut title = None;
    let mut shelf = None;
    let mut tags = Vec::new();
    let mut created = None;
    let mut updated = None;
    let mut reading_tags = false;

    for line in frontmatter.lines() {
        if reading_tags {
            if let Some(value) = line.trim_start().strip_prefix("- ") {
                tags.push(parse_scalar(value, path, "tag")?);
                continue;
            }
            reading_tags = false;
        }

        let Some((key, raw_value)) = line.split_once(':') else {
            continue;
        };
        let value = raw_value.trim();
        match key.trim() {
            "id" => id = Some(parse_scalar(value, path, "id")?),
            "title" => title = Some(parse_scalar(value, path, "title")?),
            "shelf" => shelf = Some(parse_scalar(value, path, "shelf")?),
            "tags" if value.is_empty() => reading_tags = true,
            "tags" if value == "[]" => tags.clear(),
            "created" => created = Some(parse_scalar(value, path, "created")?),
            "updated" => updated = Some(parse_scalar(value, path, "updated")?),
            _ => {}
        }
    }

    Ok(Note {
        id: required(id, path, "id")?,
        title: required(title, path, "title")?,
        shelf: required(shelf, path, "shelf")?,
        tags,
        created: required(created, path, "created")?,
        updated: required(updated, path, "updated")?,
        body,
        path: path.to_owned(),
    })
}

fn parse_scalar(value: &str, path: &str, field: &str) -> Result<String, PackError> {
    if value.starts_with('"') {
        serde_json::from_str(value)
            .map_err(|error| invalid(path, &format!("invalid {field}: {error}")))
    } else {
        Ok(value.to_owned())
    }
}

fn required(value: Option<String>, path: &str, field: &str) -> Result<String, PackError> {
    value
        .filter(|value| !value.is_empty())
        .ok_or_else(|| invalid(path, &format!("missing {field}")))
}

fn invalid(path: &str, message: &str) -> PackError {
    PackError::InvalidNote {
        path: path.to_owned(),
        message: message.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn slugify_matches_pack_core() {
        assert_eq!(
            slugify_title("Prefer short answers"),
            "prefer-short-answers"
        );
        assert_eq!(slugify_title("  "), "note");
        assert_eq!(
            slugify_title(&format!("{} ! b", "a".repeat(79))),
            format!("{}-", "a".repeat(79))
        );
    }

    #[test]
    fn round_trip_fixture_prefer_short_answers() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../fixtures/personal-os/preferences/prefer-short-answers.md"
        );
        let raw = std::fs::read_to_string(path).expect("fixture");
        let note = parse_note(&raw, "preferences/prefer-short-answers.md").unwrap();
        assert_eq!(note.id, "note_pref_short");
        assert_eq!(note.title, "Prefer short answers");
        assert_eq!(note.shelf, "preferences");
        assert_eq!(note.tags, vec!["style".to_string()]);
        assert!(note.body.contains("concise bullet"));
        let again = parse_note(&serialize_note(&note), &note.path).unwrap();
        assert_eq!(again, note);
    }

    #[test]
    fn new_note_id_shape() {
        let id = new_note_id();
        assert!(id.starts_with("note_"));
        assert_eq!(id.len(), "note_".len() + 12);
        assert!(id["note_".len()..]
            .chars()
            .all(|character| character.is_ascii_hexdigit() && !character.is_ascii_uppercase()));
    }

    #[test]
    fn round_trips_all_fixture_notes() {
        fn visit(directory: &Path, root: &Path) {
            for entry in std::fs::read_dir(directory).expect("fixture directory") {
                let path = entry.expect("fixture entry").path();
                if path.is_dir() {
                    visit(&path, root);
                } else if path.extension().and_then(|extension| extension.to_str()) == Some("md")
                    && !path
                        .file_name()
                        .is_some_and(|name| name.to_string_lossy().starts_with("._"))
                {
                    let raw = std::fs::read_to_string(&path).expect("fixture note");
                    let relative = path
                        .strip_prefix(root)
                        .expect("relative fixture path")
                        .to_string_lossy();
                    let note = parse_note(&raw, &relative).expect("parse fixture note");
                    let again = parse_note(&serialize_note(&note), &note.path)
                        .expect("parse serialized fixture note");
                    assert_eq!(again, note, "round trip {}", path.display());
                }
            }
        }

        let root = Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../../fixtures/personal-os"
        ));
        visit(root, root);
    }
}
