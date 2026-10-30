fn strip_apple_double(dir: &str) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("._") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

fn main() {
    // exFAT stores macOS AppleDouble sidecars next to real files. Tauri reads
    // every capabilities entry as UTF-8 and fails on those sidecars.
    strip_apple_double("capabilities");
    strip_apple_double("icons");
    tauri_build::build();
}
