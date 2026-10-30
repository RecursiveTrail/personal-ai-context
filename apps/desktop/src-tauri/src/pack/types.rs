use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub shelf: String,
    pub tags: Vec<String>,
    pub created: String,
    pub updated: String,
    pub body: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub id: String,
    pub path: String,
    pub shelf: String,
    pub title: String,
    pub updated: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub notes: Vec<ManifestEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    pub path: String,
    pub shelf: String,
    pub excerpt: String,
    pub score: i32,
}
