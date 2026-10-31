use std::path::Path;

fn strip_apple_double(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("._") {
            if path.is_dir() {
                let _ = std::fs::remove_dir_all(&path);
            } else {
                let _ = std::fs::remove_file(&path);
            }
            continue;
        }
        if path.is_dir() {
            strip_apple_double(&path);
        }
    }
}

fn main() {
    // exFAT stores macOS AppleDouble sidecars next to real files. Tauri and
    // Cargo both treat those as real entries (capabilities UTF-8, src/bin/*.rs).
    for dir in ["capabilities", "icons", "src", "gen"] {
        strip_apple_double(Path::new(dir));
    }
    tauri_build::build();
}
