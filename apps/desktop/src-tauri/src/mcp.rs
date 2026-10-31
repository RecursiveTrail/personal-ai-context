//! MCP stdio tools over the shared pack store (parity with Node `mcpTools.ts`, plus writes).
//!
//! `handlers` holds thin, protocol-free functions; `PersonalOsMcp` only adapts them to rmcp.

use crate::store::{Store, UpsertInput};
use crate::pending::{PendingOp, PendingQueue, PendingRecord};
use parking_lot::{Mutex, RwLock};
use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, Content, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler,
};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

pub type SharedStore = Arc<RwLock<Store>>;
/// Shared with the desktop host so approve/reject act on the same queue MCP writes into.
pub type SharedPending = Arc<Mutex<PendingQueue>>;

/// Protocol-free tool implementations. Each returns the JSON value that becomes the single
/// text content item; `Err(message)` becomes an MCP tool error whose text is `{"error": message}`.
pub mod handlers {
    use super::*;
    use serde_json::json;

    pub fn list_shelves(store: &SharedStore) -> Value {
        json!(store.read().list_shelves())
    }

    pub fn search_context(store: &SharedStore, query: &str, shelf: Option<&str>) -> Value {
        json!(store.read().search(query, shelf))
    }

    /// `null` when the note does not exist (Node parity).
    pub fn get_note(store: &SharedStore, id_or_path: &str) -> Value {
        json!(store.read().get_note(id_or_path))
    }

    pub fn reload_pack(store: &SharedStore) -> Result<Value, String> {
        let mut store = store.write();
        store.reload().map_err(|e| e.to_string())?;
        Ok(json!({
            "ok": true,
            "notes": store.note_count(),
            "shelves": store.list_shelves(),
        }))
    }

    fn queued(record: &PendingRecord) -> Value {
        let preview = match (&record.note, &record.target_id_or_path) {
            (Some(note), _) => json!({
                "title": note.title,
                "shelf": note.shelf,
                "path": note.path,
            }),
            (None, Some(target)) => json!({ "idOrPath": target }),
            (None, None) => json!({}),
        };
        json!({
            "pending": true,
            "id": record.id,
            "op": match record.op {
                PendingOp::Upsert => "upsert",
                PendingOp::Delete => "delete",
            },
            "preview": preview,
        })
    }

    /// Queue the write for human approval; the pack is untouched until approved.
    pub fn upsert_note(pending: &SharedPending, args: UpsertNoteArgs) -> Result<Value, String> {
        let record = pending
            .lock()
            .enqueue_upsert(UpsertInput {
                id: args.id,
                title: args.title,
                shelf: args.shelf,
                body: args.body,
                tags: args.tags,
                updated: None,
                created: None,
            })
            .map_err(|e| e.to_string())?;
        Ok(queued(&record))
    }

    /// Queue the deletion for human approval; the note stays until approved.
    pub fn delete_note(pending: &SharedPending, id_or_path: &str) -> Result<Value, String> {
        let record = pending
            .lock()
            .enqueue_delete(id_or_path)
            .map_err(|e| e.to_string())?;
        Ok(queued(&record))
    }

    pub fn list_pending(pending: &SharedPending) -> Value {
        json!(pending.lock().list())
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SearchContextArgs {
    /// Search query
    pub query: String,
    /// Optional shelf filter
    pub shelf: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetNoteArgs {
    /// Note id or pack-relative path
    #[serde(rename = "idOrPath")]
    pub id_or_path: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpsertNoteArgs {
    /// Existing note id to update; omit to create a new note
    pub id: Option<String>,
    pub title: String,
    /// Shelf (top-level folder) name, e.g. `preferences`
    pub shelf: String,
    /// Markdown body
    pub body: String,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DeleteNoteArgs {
    /// Note id or pack-relative path
    #[serde(rename = "idOrPath")]
    pub id_or_path: String,
}

/// rmcp 0.6 emits `{}` for argument-less tools; MCP clients expect `{"type":"object"}`.
fn no_args_schema() -> Arc<serde_json::Map<String, Value>> {
    let mut schema = serde_json::Map::new();
    schema.insert("type".into(), Value::String("object".into()));
    Arc::new(schema)
}

fn text_result(value: &Value) -> CallToolResult {
    CallToolResult::success(vec![Content::text(
        serde_json::to_string(value).expect("serde_json::Value always serializes"),
    )])
}

fn tool_result(result: Result<Value, String>) -> CallToolResult {
    match result {
        Ok(value) => text_result(&value),
        Err(message) => CallToolResult::error(vec![Content::text(
            serde_json::to_string(&serde_json::json!({ "error": message }))
                .expect("serde_json::Value always serializes"),
        )]),
    }
}

#[derive(Clone)]
pub struct PersonalOsMcp {
    store: SharedStore,
    pending: SharedPending,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl PersonalOsMcp {
    pub fn new(store: SharedStore, pending: SharedPending) -> Self {
        Self {
            store,
            pending,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "List shelves in the personal context pack, including empty on-disk shelf folders",
        input_schema = no_args_schema(),
        annotations(read_only_hint = true, destructive_hint = false, idempotent_hint = true, open_world_hint = false)
    )]
    async fn list_shelves(&self) -> Result<CallToolResult, McpError> {
        Ok(text_result(&handlers::list_shelves(&self.store)))
    }

    #[tool(
        description = "Search personal context notes, optionally within a shelf. Tags may include capture provenance such as capture:text or capture:voice; treat those as source metadata, not user preferences.",
        annotations(read_only_hint = true, destructive_hint = false, idempotent_hint = true, open_world_hint = false)
    )]
    async fn search_context(
        &self,
        Parameters(args): Parameters<SearchContextArgs>,
    ) -> Result<CallToolResult, McpError> {
        Ok(text_result(&handlers::search_context(
            &self.store,
            &args.query,
            args.shelf.as_deref(),
        )))
    }

    #[tool(
        description = "Get a complete context note by its id or pack-relative path. Returns null when not found. Tags may include capture:text, capture:voice, capture:pdf, or capture:clipboard as provenance.",
        annotations(read_only_hint = true, destructive_hint = false, idempotent_hint = true, open_world_hint = false)
    )]
    async fn get_note(
        &self,
        Parameters(args): Parameters<GetNoteArgs>,
    ) -> Result<CallToolResult, McpError> {
        Ok(text_result(&handlers::get_note(&self.store, &args.id_or_path)))
    }

    #[tool(
        description = "Re-read the configured personal-os pack from disk after the user replaces exported files",
        input_schema = no_args_schema(),
        annotations(read_only_hint = true, destructive_hint = false, idempotent_hint = true, open_world_hint = false)
    )]
    async fn reload_pack(&self) -> Result<CallToolResult, McpError> {
        Ok(tool_result(handlers::reload_pack(&self.store)))
    }

    #[tool(
        description = "Propose creating or updating a context note. Omit id to create; provide an existing id to update. The change is queued for the user to approve in the desktop app and is NOT applied yet; returns {pending:true,id,op,preview}.",
        annotations(read_only_hint = false, destructive_hint = false, idempotent_hint = false, open_world_hint = false)
    )]
    async fn upsert_note(
        &self,
        Parameters(args): Parameters<UpsertNoteArgs>,
    ) -> Result<CallToolResult, McpError> {
        Ok(tool_result(handlers::upsert_note(&self.pending, args)))
    }

    #[tool(
        description = "Propose deleting a context note by id or pack-relative path. Queued for the user to approve and NOT applied yet; returns {pending:true,id,op,preview}.",
        annotations(read_only_hint = false, destructive_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn delete_note(
        &self,
        Parameters(args): Parameters<DeleteNoteArgs>,
    ) -> Result<CallToolResult, McpError> {
        Ok(tool_result(handlers::delete_note(&self.pending, &args.id_or_path)))
    }

    #[tool(
        description = "List note writes (upsert/delete) proposed over MCP that are still waiting for the user's approval",
        input_schema = no_args_schema(),
        annotations(read_only_hint = true, destructive_hint = false, idempotent_hint = true, open_world_hint = false)
    )]
    async fn list_pending(&self) -> Result<CallToolResult, McpError> {
        Ok(text_result(&handlers::list_pending(&self.pending)))
    }
}

#[tool_handler]
impl ServerHandler for PersonalOsMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some(
                "Personal context pack: search and read notes, and propose create/update/delete (applied after the user approves)."
                    .into(),
            ),
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            ..Default::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn pack() -> (tempfile::TempDir, SharedStore, SharedPending) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("personal-os");
        std::fs::create_dir_all(root.join("preferences")).unwrap();
        let store = Arc::new(RwLock::new(Store::load(root.clone()).unwrap()));
        let pending = Arc::new(Mutex::new(PendingQueue::load(root)));
        (dir, store, pending)
    }

    fn args(title: &str) -> UpsertNoteArgs {
        UpsertNoteArgs {
            id: None,
            title: title.into(),
            shelf: "preferences".into(),
            body: "dark mode please".into(),
            tags: Some(vec!["style".into()]),
        }
    }

    /// Seed an approved note directly through the store (MCP writes only enqueue).
    fn seed(store: &SharedStore, title: &str) -> String {
        store
            .write()
            .upsert_note(UpsertInput {
                id: None,
                title: title.into(),
                shelf: "preferences".into(),
                body: "dark mode please".into(),
                tags: Some(vec!["style".into()]),
                updated: None,
                created: None,
            })
            .unwrap()
            .id
    }

    #[test]
    fn upsert_note_handler_enqueues_without_writing_pack() {
        let (dir, store, pending) = pack();
        let out = handlers::upsert_note(&pending, args("Dark mode")).unwrap();
        assert_eq!(out["pending"], true);
        assert_eq!(out["op"], "upsert");
        assert!(out["id"].as_str().unwrap().starts_with("pend_"));
        assert_eq!(
            out["preview"],
            json!({"title": "Dark mode", "shelf": "preferences", "path": "preferences/dark-mode.md"})
        );
        let root = dir.path().join("personal-os");
        assert!(!root.join("preferences/dark-mode.md").exists());
        assert!(!root.join("_meta/manifest.json").exists());
        assert_eq!(store.read().note_count(), 0);
        assert_eq!(handlers::search_context(&store, "dark", None), json!([]));

        // Durable on disk and visible to list_pending.
        let id = out["id"].as_str().unwrap();
        assert!(root.join(format!("_meta/pending/{id}.json")).exists());
        let listed = handlers::list_pending(&pending);
        assert_eq!(listed.as_array().unwrap().len(), 1);
        assert_eq!(listed[0]["id"], id);
        assert_eq!(listed[0]["op"], "upsert");
        assert_eq!(listed[0]["note"]["title"], "Dark mode");
    }

    #[test]
    fn approving_a_queued_upsert_applies_it() {
        let (dir, store, pending) = pack();
        let out = handlers::upsert_note(&pending, args("Dark mode")).unwrap();
        let id = out["id"].as_str().unwrap();
        pending.lock().approve(id, &mut store.write()).unwrap();
        assert!(dir.path().join("personal-os/preferences/dark-mode.md").exists());
        assert_eq!(handlers::list_pending(&pending), json!([]));
    }

    #[test]
    fn read_handlers_match_node_shapes() {
        let (_dir, store, _pending) = pack();
        let id = seed(&store, "Dark mode");

        assert_eq!(handlers::list_shelves(&store), json!(["preferences"]));
        let hits = handlers::search_context(&store, "dark", None);
        assert_eq!(hits[0]["id"], id);
        assert_eq!(handlers::search_context(&store, "dark", Some("nope")), json!([]));
        assert_eq!(handlers::get_note(&store, &id)["title"], "Dark mode");
        assert_eq!(handlers::get_note(&store, "preferences/dark-mode.md")["id"], id);
        assert_eq!(handlers::get_note(&store, "missing"), Value::Null);
    }

    #[test]
    fn upsert_with_id_queues_update_and_rejects_invalid() {
        let (_dir, store, pending) = pack();
        let id = seed(&store, "Dark mode");
        let mut update = args("Dark mode");
        update.id = Some(id.clone());
        update.body = "changed".into();
        update.tags = None;
        let out = handlers::upsert_note(&pending, update).unwrap();
        assert_eq!(out["pending"], true);
        // Pack unchanged until approved.
        assert_eq!(
            handlers::get_note(&store, &id)["body"].as_str().unwrap().trim_end(),
            "dark mode please"
        );
        pending
            .lock()
            .approve(out["id"].as_str().unwrap(), &mut store.write())
            .unwrap();
        let updated = handlers::get_note(&store, &id);
        assert_eq!(updated["body"].as_str().unwrap().trim_end(), "changed");
        assert_eq!(updated["tags"], json!(["style"]));

        let mut bad = args("x");
        bad.shelf = " ".into();
        assert!(handlers::upsert_note(&pending, bad).is_err());
        assert!(handlers::upsert_note(&pending, args("  ")).is_err());
        assert_eq!(handlers::list_pending(&pending), json!([]));
    }

    #[test]
    fn delete_note_handler_enqueues_without_deleting() {
        let (dir, store, pending) = pack();
        let id = seed(&store, "Dark mode");
        let out = handlers::delete_note(&pending, &id).unwrap();
        assert_eq!(out["pending"], true);
        assert_eq!(out["op"], "delete");
        assert!(out["id"].as_str().unwrap().starts_with("pend_"));
        assert_eq!(out["preview"], json!({"idOrPath": id}));
        assert!(dir.path().join("personal-os/preferences/dark-mode.md").exists());
        assert!(handlers::get_note(&store, &id).is_object());

        let listed = handlers::list_pending(&pending);
        assert_eq!(listed[0]["op"], "delete");
        assert_eq!(listed[0]["targetIdOrPath"], id);

        pending
            .lock()
            .approve(out["id"].as_str().unwrap(), &mut store.write())
            .unwrap();
        assert!(!dir.path().join("personal-os/preferences/dark-mode.md").exists());
        assert!(handlers::delete_note(&pending, "  ").is_err());
    }

    #[test]
    fn reload_pack_picks_up_external_files() {
        let (dir, store, _pending) = pack();
        let root = dir.path().join("personal-os");
        std::fs::create_dir_all(root.join("routines")).unwrap();
        let out = handlers::reload_pack(&store).unwrap();
        assert_eq!(out["ok"], true);
        assert_eq!(out["notes"], 0);
        assert_eq!(out["shelves"], json!(["preferences", "routines"]));
    }

    #[test]
    fn text_result_is_single_json_text_item() {
        let result = text_result(&json!({"ok": true}));
        let wire = serde_json::to_value(&result).unwrap();
        assert_eq!(wire["content"].as_array().unwrap().len(), 1);
        assert_eq!(wire["content"][0]["type"], "text");
        assert_eq!(wire["content"][0]["text"], "{\"ok\":true}");
    }

    #[test]
    fn handler_error_text_is_json() {
        let (_dir, _store, pending) = pack();
        let message = handlers::upsert_note(&pending, args("  ")).unwrap_err();
        let result = tool_result(Err(message));
        let wire = serde_json::to_value(&result).unwrap();
        assert_eq!(wire["isError"], true);
        let content = wire["content"].as_array().unwrap();
        assert_eq!(content.len(), 1);
        assert_eq!(content[0]["type"], "text");
        let parsed: Value = serde_json::from_str(content[0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(
            parsed,
            json!({"error": "invalid pending record: title must not be empty"})
        );
    }

    #[test]
    fn tool_router_exposes_expected_tools() {
        let (_dir, store, pending) = pack();
        let server = PersonalOsMcp::new(store, pending);
        let mut names: Vec<String> = server
            .tool_router
            .list_all()
            .into_iter()
            .map(|t| t.name.to_string())
            .collect();
        names.sort();
        assert_eq!(
            names,
            [
                "delete_note",
                "get_note",
                "list_pending",
                "list_shelves",
                "reload_pack",
                "search_context",
                "upsert_note"
            ]
        );
    }
}
