use std::fs;
use std::path::Path;
use std::process::Command;

use crate::services::scanner;

/// Read image bytes for the API. For RAW files, extract embedded JPEG via exiftool.
/// For standard image files, read the file directly.
pub fn extract_image_bytes(image_path: &Path) -> Result<Vec<u8>, String> {
    let ext = image_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    if scanner::is_raw_extension(ext) {
        extract_jpeg_from_raw(image_path)
    } else {
        fs::read(image_path).map_err(|e| format!("Failed to read {}: {e}", image_path.display()))
    }
}

fn extract_jpeg_from_raw(raw_path: &Path) -> Result<Vec<u8>, String> {
    let output = Command::new("exiftool")
        .args(["-b", "-JpgFromRaw"])
        .arg(raw_path)
        .output()
        .map_err(|e| format!("Failed to execute exiftool: {e}"))?;

    if !output.status.success() || output.stdout.is_empty() {
        let fallback = Command::new("exiftool")
            .args(["-b", "-PreviewImage"])
            .arg(raw_path)
            .output()
            .map_err(|e| format!("exiftool fallback failed: {e}"))?;

        if !fallback.status.success() || fallback.stdout.is_empty() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "No embedded JPEG in {}: {stderr}",
                raw_path.display()
            ));
        }
        return Ok(fallback.stdout);
    }

    Ok(output.stdout)
}
