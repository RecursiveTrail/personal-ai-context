//! MCP stdio tools over the shared pack store (parity with Node `mcpTools.ts`, plus writes).
//!
//! `handlers` holds thin, protocol-free functions; `PersonalOsMcp` only adapts them to rmcp.

use crate::store::{Store, UpsertInput};
use parking_lot::RwLock;
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

/// Protocol-free tool implementations. Each returns the JSON value that becomes the single
/// text content item; `Err(message)` becomes an MCP tool error.
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

    pub fn upsert_note(store: &SharedStore, args: UpsertNoteArgs) -> Result<Value, String> {
        let note = store
            .write()
            .upsert_note(UpsertInput {
                id: args.id,
                title: args.title,
                shelf: args.shelf,
                body: args.body,
                tags: args.tags,
                updated: None,
            })
            .map_err(|e| e.to_string())?;
        Ok(json!(note))
    }

    pub fn delete_note(store: &SharedStore, id_or_path: &str) -> Result<Value, String> {
        match store.write().delete_note(id_or_path) {
            Ok(true) => Ok(json!({ "ok": true })),
            Ok(false) => Ok(json!({ "ok": false, "error": "not_found" })),
            Err(e) => Err(e.to_string()),
        }
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
        Err(message) => CallToolResult::error(vec![Content::text(message)]),
    }
}

#[derive(Clone)]
pub struct PersonalOsMcp {
    store: SharedStore,
    tool_router: ToolRouter<Self>,
}

#[tool_router]
impl PersonalOsMcp {
    pub fn new(store: SharedStore) -> Self {
        Self {
            store,
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
        description = "Create or update a context note in the pack on disk. Omit id to create; provide an existing id to update. Returns the full note.",
        annotations(read_only_hint = false, destructive_hint = false, idempotent_hint = false, open_world_hint = false)
    )]
    async fn upsert_note(
        &self,
        Parameters(args): Parameters<UpsertNoteArgs>,
    ) -> Result<CallToolResult, McpError> {
        Ok(tool_result(handlers::upsert_note(&self.store, args)))
    }

    #[tool(
        description = "Delete a context note by id or pack-relative path. Returns {ok:true}, or {ok:false,error:\"not_found\"}.",
        annotations(read_only_hint = false, destructive_hint = true, idempotent_hint = true, open_world_hint = false)
    )]
    async fn delete_note(
        &self,
        Parameters(args): Parameters<DeleteNoteArgs>,
    ) -> Result<CallToolResult, McpError> {
        Ok(tool_result(handlers::delete_note(&self.store, &args.id_or_path)))
    }
}

#[tool_handler]
impl ServerHandler for PersonalOsMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            instructions: Some(
                "Personal context pack: search and read notes, and create/update/delete them."
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

    fn pack() -> (tempfile::TempDir, SharedStore) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("personal-os");
        std::fs::create_dir_all(root.join("preferences")).unwrap();
        let store = Arc::new(RwLock::new(Store::load(root).unwrap()));
        (dir, store)
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

    #[test]
    fn upsert_note_handler_writes_pack() {
        let (dir, store) = pack();
        let note = handlers::upsert_note(&store, args("Dark mode")).unwrap();
        let path = note["path"].as_str().unwrap();
        assert_eq!(path, "preferences/dark-mode.md");
        assert!(dir.path().join("personal-os").join(path).exists());
        assert!(dir.path().join("personal-os/_meta/manifest.json").exists());
        assert_eq!(note["tags"], json!(["style"]));

        // Round-trips through a fresh load from disk.
        let reloaded = Store::load(dir.path().join("personal-os")).unwrap();
        assert!(reloaded.get_note(note["id"].as_str().unwrap()).is_some());
    }

    #[test]
    fn read_handlers_match_node_shapes() {
        let (_dir, store) = pack();
        let note = handlers::upsert_note(&store, args("Dark mode")).unwrap();
        let id = note["id"].as_str().unwrap();

        assert_eq!(handlers::list_shelves(&store), json!(["preferences"]));
        let hits = handlers::search_context(&store, "dark", None);
        assert_eq!(hits[0]["id"], id);
        assert_eq!(handlers::search_context(&store, "dark", Some("nope")), json!([]));
        assert_eq!(handlers::get_note(&store, id)["title"], "Dark mode");
        assert_eq!(handlers::get_note(&store, "preferences/dark-mode.md")["id"], id);
        assert_eq!(handlers::get_note(&store, "missing"), Value::Null);
    }

    #[test]
    fn upsert_updates_existing_and_rejects_invalid() {
        let (_dir, store) = pack();
        let note = handlers::upsert_note(&store, args("Dark mode")).unwrap();
        let mut update = args("Dark mode");
        update.id = Some(note["id"].as_str().unwrap().into());
        update.body = "changed".into();
        update.tags = None;
        let updated = handlers::upsert_note(&store, update).unwrap();
        assert_eq!(updated["id"], note["id"]);
        assert_eq!(updated["body"].as_str().unwrap().trim_end(), "changed");
        assert_eq!(updated["tags"], json!(["style"]));

        let mut bad = args("x");
        bad.shelf = "../evil".into();
        assert!(handlers::upsert_note(&store, bad).is_err());
        assert!(handlers::upsert_note(&store, args("  ")).is_err());
    }

    #[test]
    fn delete_note_handler_ok_and_not_found() {
        let (dir, store) = pack();
        let note = handlers::upsert_note(&store, args("Dark mode")).unwrap();
        let id = note["id"].as_str().unwrap();
        assert_eq!(handlers::delete_note(&store, id).unwrap(), json!({"ok": true}));
        assert!(!dir
            .path()
            .join("personal-os/preferences/dark-mode.md")
            .exists());
        assert_eq!(
            handlers::delete_note(&store, id).unwrap(),
            json!({"ok": false, "error": "not_found"})
        );
    }

    #[test]
    fn reload_pack_picks_up_external_files() {
        let (dir, store) = pack();
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
    fn tool_router_exposes_expected_tools() {
        let (_dir, store) = pack();
        let server = PersonalOsMcp::new(store);
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
                "list_shelves",
                "reload_pack",
                "search_context",
                "upsert_note"
            ]
        );
    }
}
