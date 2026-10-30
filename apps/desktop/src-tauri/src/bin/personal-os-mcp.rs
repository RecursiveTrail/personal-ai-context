//! Stdio MCP server for the personal-os pack.
//!
//! Cursor config:
//! ```json
//! { "mcpServers": { "personal-os": {
//!   "command": "/ABS/PATH/to/personal-os-mcp",
//!   "args": ["--pack", "/ABS/PATH/to/personal-os"] } } }
//! ```
//! stdout carries the MCP protocol; all diagnostics go to stderr.

use parking_lot::RwLock;
use personal_os_desktop_lib::{mcp::PersonalOsMcp, store::Store};
use rmcp::{transport::stdio, ServiceExt};
use std::{path::PathBuf, process::ExitCode, sync::Arc};

fn parse_pack_arg() -> Result<PathBuf, String> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--pack" {
            return args
                .next()
                .map(PathBuf::from)
                .ok_or_else(|| "--pack requires a path".to_string());
        }
        if let Some(path) = arg.strip_prefix("--pack=") {
            return Ok(PathBuf::from(path));
        }
    }
    Err("usage: personal-os-mcp --pack <path-to-personal-os>".into())
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let pack = parse_pack_arg()?;
    let store = Store::load(pack)?;
    let service = PersonalOsMcp::new(Arc::new(RwLock::new(store)))
        .serve(stdio())
        .await?;
    service.waiting().await?;
    Ok(())
}

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
