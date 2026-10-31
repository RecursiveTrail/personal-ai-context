//! Resolve Cursor MCP connect paths for the Chit desk UI.

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpConnectInfo {
    pub mcp_binary: String,
    pub pack_path: String,
}

pub fn mcp_binary_name() -> &'static str {
    #[cfg(windows)]
    {
        "personal-os-mcp.exe"
    }
    #[cfg(not(windows))]
    {
        "personal-os-mcp"
    }
}

/// Resolve `personal-os-mcp` as a sibling of the running desktop binary.
pub fn resolve_mcp_connect_info(exe_dir: &Path, pack_path: &str) -> Result<McpConnectInfo, String> {
    let candidate: PathBuf = exe_dir.join(mcp_binary_name());
    if !candidate.is_file() {
        return Err(format!(
            "personal-os-mcp not found at {}",
            candidate.display()
        ));
    }
    let mcp_binary = candidate
        .canonicalize()
        .unwrap_or(candidate)
        .display()
        .to_string();
    Ok(McpConnectInfo {
        mcp_binary,
        pack_path: pack_path.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn resolves_when_sibling_binary_exists() {
        let dir = tempdir().unwrap();
        let name = mcp_binary_name();
        let bin = dir.path().join(name);
        fs::write(&bin, b"x").unwrap();
        let info = resolve_mcp_connect_info(dir.path(), "/tmp/pack").unwrap();
        assert!(info.mcp_binary.ends_with(name) || info.mcp_binary.contains(name));
        assert!(Path::new(&info.mcp_binary).is_file());
        assert_eq!(info.pack_path, "/tmp/pack");
    }

    #[test]
    fn errors_when_sibling_missing() {
        let dir = tempdir().unwrap();
        let err = resolve_mcp_connect_info(dir.path(), "/tmp/pack").unwrap_err();
        assert!(err.contains("personal-os-mcp"));
        assert!(err.contains("not found"));
    }
}
