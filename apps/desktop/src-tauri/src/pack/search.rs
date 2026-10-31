use super::types::{Note, SearchHit};

pub fn search_notes(notes: &[Note], query: &str, shelf: Option<&str>) -> Vec<SearchHit> {
    let tokens = tokenize(query);
    let scoped = notes.iter().filter(|note| match shelf {
        Some(shelf) => note.shelf == shelf,
        None => true,
    });

    if tokens.is_empty() {
        if !js_trim(query).is_empty() {
            return Vec::new();
        }
        return scoped.map(|note| to_hit(note, 0)).collect();
    }

    let mut hits: Vec<SearchHit> = scoped
        .filter_map(|note| {
            let score = score_note(note, &tokens);
            (score > 0).then(|| to_hit(note, score))
        })
        .collect();
    hits.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.title.cmp(&right.title))
    });
    hits
}

fn tokenize(query: &str) -> Vec<String> {
    query
        .to_lowercase()
        .split(|character: char| !character.is_ascii_lowercase() && !character.is_ascii_digit())
        .filter(|token| token.len() > 1)
        .map(str::to_owned)
        .collect()
}

fn score_note(note: &Note, tokens: &[String]) -> i32 {
    let haystack = format!("{} {} {}", note.title, note.tags.join(" "), note.body).to_lowercase();
    let title = note.title.to_lowercase();
    let mut score = 0;
    for token in tokens {
        if title.contains(token) {
            score += 3;
        }
        if note
            .tags
            .iter()
            .any(|tag| tag.to_lowercase().contains(token))
        {
            score += 2;
        }
        if haystack.contains(token) {
            score += 1;
        }
    }
    score
}

fn excerpt(body: &str) -> String {
    const MAX: usize = 160;
    let one_line = collapse_whitespace(body);
    let length = one_line.chars().count();
    if length <= MAX {
        return one_line;
    }
    let truncated: String = one_line.chars().take(MAX - 1).collect();
    format!("{truncated}…")
}

fn is_js_whitespace(character: char) -> bool {
    character == '\u{FEFF}' || (character.is_whitespace() && character != '\u{0085}')
}

fn js_trim(value: &str) -> &str {
    value.trim_matches(is_js_whitespace)
}

fn collapse_whitespace(body: &str) -> String {
    let mut collapsed = String::new();
    let mut pending_space = false;
    for character in body.chars() {
        if is_js_whitespace(character) {
            if !collapsed.is_empty() {
                pending_space = true;
            }
        } else {
            if pending_space {
                collapsed.push(' ');
                pending_space = false;
            }
            collapsed.push(character);
        }
    }
    collapsed
}

fn to_hit(note: &Note, score: i32) -> SearchHit {
    SearchHit {
        id: note.id.clone(),
        title: note.title.clone(),
        path: note.path.clone(),
        shelf: note.shelf.clone(),
        excerpt: excerpt(&note.body),
        score,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_query_returns_all_score_zero() {
        let notes = vec![Note {
            id: "note_a".into(),
            title: "Alpha".into(),
            shelf: "preferences".into(),
            tags: vec![],
            created: "2026-01-01T00:00:00.000Z".into(),
            updated: "2026-01-01T00:00:00.000Z".into(),
            body: "hello world".into(),
            path: "preferences/alpha.md".into(),
        }];
        let hits = search_notes(&notes, "   ", None);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].score, 0);
    }

    #[test]
    fn scores_title_tag_and_haystack_like_js() {
        let notes = vec![Note {
            id: "note_a".into(),
            title: "Prefer short answers".into(),
            shelf: "preferences".into(),
            tags: vec!["style".into()],
            created: "2026-01-01T00:00:00.000Z".into(),
            updated: "2026-01-01T00:00:00.000Z".into(),
            body: "I prefer concise bullet answers".into(),
            path: "preferences/prefer-short-answers.md".into(),
        }];
        let hits = search_notes(&notes, "prefer style", None);
        assert_eq!(hits[0].id, "note_a");
        // tokens: prefer, style — title+3, tag+2, hay+1 each when present
        assert!(hits[0].score >= 6);
    }
}
