//! Localhost HTTP API over the shared pack store (capture sync + agent reads).

use crate::pack::types::{Note, SearchHit};
use crate::store::{Store, StoreError, UpsertInput};
use crate::sync::apply_sync;
use axum::{
    extract::{Path, Query, State},
    http::{header::HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use parking_lot::RwLock;
use serde::Deserialize;
use serde_json::json;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::{AllowOrigin, CorsLayer};

const EMPTY_SEARCH_HINT: &str = "Broaden query or drop shelf filter";

type SharedStore = Arc<RwLock<Store>>;

/// Bind `addr` (callers pass `127.0.0.1`; default `127.0.0.1:8787`) and serve until error.
pub async fn serve(store: Arc<RwLock<Store>>, addr: SocketAddr) -> std::io::Result<()> {
    let listener = TcpListener::bind(addr).await?;
    serve_listener(store, listener).await
}

/// Serve on an already-bound listener (lets tests use an ephemeral port).
pub async fn serve_listener(
    store: Arc<RwLock<Store>>,
    listener: TcpListener,
) -> std::io::Result<()> {
    axum::serve(listener, router(store)).await
}

pub fn router(store: Arc<RwLock<Store>>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/notes", get(list_notes))
        .route(
            "/notes/{*id}",
            get(get_note).put(put_note).delete(delete_note),
        )
        .route("/sync", post(sync))
        .route("/shelves", get(shelves))
        .route("/search", get(search))
        .layer(cors_layer())
        .with_state(store)
}

fn is_local_origin(origin: &HeaderValue) -> bool {
    let Ok(origin) = origin.to_str() else {
        return false;
    };
    let Some(rest) = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"))
    else {
        return false;
    };
    let host = rest.split(':').next().unwrap_or("");
    let port_ok = match rest.split_once(':') {
        Some((_, port)) => !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()),
        None => true,
    };
    port_ok && matches!(host, "localhost" | "127.0.0.1")
}

fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(|origin, _| is_local_origin(origin)))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(tower_http::cors::Any)
}

struct ApiError(StatusCode, String);

impl From<StoreError> for ApiError {
    fn from(error: StoreError) -> Self {
        let status = match error {
            StoreError::InvalidInput(_) | StoreError::InvalidPath(_) => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        ApiError(status, error.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

fn not_found() -> ApiError {
    ApiError(StatusCode::NOT_FOUND, "not found".into())
}

async fn health(State(store): State<SharedStore>) -> Json<serde_json::Value> {
    Json(json!({ "ok": true, "notes": store.read().note_count() }))
}

async fn list_notes(State(store): State<SharedStore>) -> Json<serde_json::Value> {
    Json(json!({ "notes": store.read().all_notes() }))
}

async fn get_note(
    State(store): State<SharedStore>,
    Path(id_or_path): Path<String>,
) -> Result<Json<Note>, ApiError> {
    store
        .read()
        .get_note(&id_or_path)
        .map(Json)
        .ok_or_else(not_found)
}

#[derive(Debug, Deserialize)]
struct PutNote {
    title: String,
    shelf: String,
    #[serde(default)]
    body: String,
    tags: Option<Vec<String>>,
    updated: Option<String>,
    created: Option<String>,
}

async fn put_note(
    State(store): State<SharedStore>,
    Path(id): Path<String>,
    Json(payload): Json<PutNote>,
) -> Result<Json<Note>, ApiError> {
    let incoming_updated = payload
        .updated
        .as_deref()
        .map(|updated| {
            updated
                .parse::<chrono::DateTime<chrono::Utc>>()
                .map_err(|error| {
                    ApiError(
                        StatusCode::BAD_REQUEST,
                        format!("invalid updated timestamp: {error}"),
                    )
                })
        })
        .transpose()?;

    let mut store = store.write();
    if let (Some(existing), Some(incoming)) = (store.get_note(&id), incoming_updated) {
        // Last-write-wins: keep the server copy when it is strictly newer.
        if let Ok(server) = existing.updated.parse::<chrono::DateTime<chrono::Utc>>() {
            if server > incoming {
                return Ok(Json(existing));
            }
        }
    }
    let note = store.upsert_note(UpsertInput {
        id: Some(id),
        title: payload.title,
        shelf: payload.shelf,
        body: payload.body,
        tags: payload.tags,
        updated: payload.updated,
        created: payload.created,
    })?;
    Ok(Json(note))
}

async fn delete_note(
    State(store): State<SharedStore>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if store.write().delete_note(&id)? {
        Ok(Json(json!({ "ok": true })))
    } else {
        Err(not_found())
    }
}

#[derive(Debug, Deserialize)]
struct SyncRequest {
    notes: Vec<Note>,
}

async fn sync(
    State(store): State<SharedStore>,
    Json(payload): Json<SyncRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let result = apply_sync(&mut store.write(), payload.notes)?;
    Ok(Json(json!({
        "notes": result.notes,
        "applied": result.applied,
        "kept_server": result.kept_server,
    })))
}

async fn shelves(State(store): State<SharedStore>) -> Json<serde_json::Value> {
    Json(json!({ "shelves": store.read().list_shelves() }))
}

#[derive(Debug, Deserialize)]
struct SearchParams {
    #[serde(default)]
    q: String,
    shelf: Option<String>,
}

async fn search(
    State(store): State<SharedStore>,
    Query(params): Query<SearchParams>,
) -> Json<serde_json::Value> {
    let hits: Vec<SearchHit> = store
        .read()
        .search(&params.q, params.shelf.as_deref().filter(|s| !s.is_empty()));
    if hits.is_empty() {
        Json(json!({ "hits": hits, "hint": EMPTY_SEARCH_HINT }))
    } else {
        Json(json!({ "hits": hits }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    async fn spawn_server() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let pack = dir.path().join("personal-os");
        std::fs::create_dir_all(pack.join("preferences")).unwrap();
        let store = Arc::new(RwLock::new(Store::load(pack).unwrap()));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(serve_listener(store, listener));
        (dir, base)
    }

    fn note(id: &str, title: &str, updated: &str) -> Value {
        json!({
            "id": id, "title": title, "shelf": "preferences", "tags": [],
            "created": updated, "updated": updated, "body": "dark mode please",
            "path": format!("preferences/{id}.md"),
        })
    }

    #[tokio::test]
    async fn health_and_sync_round_trip() {
        let (_dir, base) = spawn_server().await;
        let client = reqwest::Client::new();

        let health: Value = client
            .get(format!("{base}/health"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(health, json!({ "ok": true, "notes": 0 }));

        let synced: Value = client
            .post(format!("{base}/sync"))
            .json(&json!({ "notes": [note("n1", "Theme", "2026-01-01T00:00:00.000Z")] }))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(synced["applied"], 1);
        assert_eq!(synced["kept_server"], 0);

        let listed: Value = client
            .get(format!("{base}/notes"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(listed["notes"].as_array().unwrap().len(), 1);
        assert_eq!(listed["notes"][0]["id"], "n1");

        let by_id: Value = client
            .get(format!("{base}/notes/n1"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let path = by_id["path"].as_str().unwrap().to_owned();
        let by_path = client
            .get(format!("{base}/notes/{path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(by_path.status(), 200);

        let shelves: Value = client
            .get(format!("{base}/shelves"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(shelves, json!({ "shelves": ["preferences"] }));
    }

    #[tokio::test]
    async fn put_delete_search_and_errors() {
        let (_dir, base) = spawn_server().await;
        let client = reqwest::Client::new();

        let missing = client
            .get(format!("{base}/notes/nope"))
            .send()
            .await
            .unwrap();
        assert_eq!(missing.status(), 404);
        let del_missing = client
            .delete(format!("{base}/notes/nope"))
            .send()
            .await
            .unwrap();
        assert_eq!(del_missing.status(), 404);

        let put = client
            .put(format!("{base}/notes/n2"))
            .json(&json!({ "title": "Editor", "shelf": "preferences", "body": "vim keys", "updated": "2026-02-01T00:00:00.000Z" }))
            .send().await.unwrap();
        assert_eq!(put.status(), 200);

        // Older write loses (LWW).
        let stale: Value = client
            .put(format!("{base}/notes/n2"))
            .json(&json!({ "title": "Old", "shelf": "preferences", "body": "old", "updated": "2026-01-01T00:00:00.000Z" }))
            .send().await.unwrap().json().await.unwrap();
        assert_eq!(stale["title"], "Editor");

        let bad = client
            .put(format!("{base}/notes/n3"))
            .json(&json!({ "title": "", "shelf": "preferences", "body": "x" }))
            .send()
            .await
            .unwrap();
        assert_eq!(bad.status(), 400);

        let hits: Value = client
            .get(format!("{base}/search?q=vim&shelf=preferences"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(hits["hits"][0]["id"], "n2");
        assert!(hits.get("hint").is_none());

        let empty: Value = client
            .get(format!("{base}/search?q=zzzzqq"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(empty["hits"], json!([]));
        assert_eq!(empty["hint"], EMPTY_SEARCH_HINT);

        let del: Value = client
            .delete(format!("{base}/notes/n2"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(del, json!({ "ok": true }));
        assert_eq!(
            client
                .get(format!("{base}/notes/n2"))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
    }

    #[tokio::test]
    async fn put_rejects_invalid_updated_without_creating_note() {
        let (_dir, base) = spawn_server().await;
        let client = reqwest::Client::new();

        let response = client
            .put(format!("{base}/notes/new-note"))
            .json(&json!({
                "title": "Invalid timestamp",
                "shelf": "preferences",
                "updated": "not-a-date"
            }))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), 400);
        assert_eq!(
            client
                .get(format!("{base}/notes/new-note"))
                .send()
                .await
                .unwrap()
                .status(),
            404
        );
    }

    #[tokio::test]
    async fn sync_rejects_entire_batch_before_writing_valid_prefix() {
        let (_dir, base) = spawn_server().await;
        let client = reqwest::Client::new();

        let response = client
            .post(format!("{base}/sync"))
            .json(&json!({
                "notes": [
                    note("valid-first", "Valid", "2026-01-01T00:00:00.000Z"),
                    note("invalid-second", "Invalid", "not-a-date")
                ]
            }))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), 400);
        for id in ["valid-first", "invalid-second"] {
            assert_eq!(
                client
                    .get(format!("{base}/notes/{id}"))
                    .send()
                    .await
                    .unwrap()
                    .status(),
                404,
                "{id} should not be persisted"
            );
        }
    }

    #[tokio::test]
    async fn cors_reflects_localhost_origins_only() {
        let (_dir, base) = spawn_server().await;
        let client = reqwest::Client::new();

        let ok = client
            .get(format!("{base}/health"))
            .header("Origin", "http://localhost:5173")
            .send()
            .await
            .unwrap();
        assert_eq!(
            ok.headers()["access-control-allow-origin"],
            "http://localhost:5173"
        );
        let ok = client
            .get(format!("{base}/health"))
            .header("Origin", "http://127.0.0.1:3000")
            .send()
            .await
            .unwrap();
        assert_eq!(
            ok.headers()["access-control-allow-origin"],
            "http://127.0.0.1:3000"
        );
        let bad = client
            .get(format!("{base}/health"))
            .header("Origin", "http://localhost.evil.com")
            .send()
            .await
            .unwrap();
        assert!(bad.headers().get("access-control-allow-origin").is_none());
    }
}
