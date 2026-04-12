use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use image::codecs::jpeg::JpegEncoder;

use crate::services::scanner;

/// Cached exiftool path, resolved once on first use.
static EXIFTOOL_PATH: OnceLock<Option<String>> = OnceLock::new();

/// Maximum dimension (width or height) for images sent to detection.
const MAX_DIMENSION: u32 = 1080;
/// JPEG quality for compressed output (0-100).
const JPEG_QUALITY: u8 = 70;
/// JPEG quality for face crop thumbnails (smaller).
const CROP_QUALITY: u8 = 80;
/// Face crop size in pixels.
const CROP_SIZE: u32 = 256;

/// Read image bytes for the API.
/// - RAW files: extract embedded JPEG via exiftool.
/// - Standard images: resize/compress locally to JPEG to save bandwidth.
/// All output images have EXIF orientation applied (pixels in correct orientation).
pub fn extract_image_bytes(image_path: &Path) -> Result<Vec<u8>, String> {
    let ext = image_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    if scanner::is_raw_extension(ext) {
        let raw_jpeg = extract_jpeg_from_raw(image_path)?;
        apply_orientation_and_reencode(&raw_jpeg, JPEG_QUALITY)
    } else {
        compress_standard_image(image_path)
    }
}

/// Read EXIF orientation from JPEG bytes, apply rotation, re-encode as JPEG.
fn apply_orientation_and_reencode(jpeg_bytes: &[u8], quality: u8) -> Result<Vec<u8>, String> {
    let orientation = read_exif_orientation(jpeg_bytes);
    if orientation <= 1 {
        return Ok(jpeg_bytes.to_vec());
    }

    let img = image::load_from_memory(jpeg_bytes)
        .map_err(|e| format!("Failed to decode for orientation fix: {e}"))?;

    log::info!("Applying EXIF orientation {} to image", orientation);
    let oriented = match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate90().flipv(),
        8 => img.rotate270(),
        _ => img,
    };

    let mut buf = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut buf, quality);
    oriented
        .write_with_encoder(encoder)
        .map_err(|e| format!("Failed to re-encode after orientation: {e}"))?;
    Ok(buf.into_inner())
}

/// Parse JPEG EXIF metadata to find the orientation tag value.
fn read_exif_orientation(image_bytes: &[u8]) -> u32 {
    let mut cursor = Cursor::new(image_bytes);
    let exif_reader = exif::Reader::new();
    exif_reader
        .read_from_container(&mut cursor)
        .ok()
        .and_then(|data| {
            data.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
                .cloned()
        })
        .and_then(|field| field.value.get_uint(0))
        .unwrap_or(1)
}

/// Open a standard image (PNG, JPG, etc.), apply EXIF orientation, resize if larger
/// than MAX_DIMENSION, and re-encode as JPEG in memory.
fn compress_standard_image(image_path: &Path) -> Result<Vec<u8>, String> {
    let raw_bytes = std::fs::read(image_path)
        .map_err(|e| format!("Failed to read {}: {e}", image_path.display()))?;

    let orientation = read_exif_orientation(&raw_bytes);

    let img = image::load_from_memory(&raw_bytes)
        .map_err(|e| format!("Failed to decode {}: {e}", image_path.display()))?;

    let img = match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate90().flipv(),
        8 => img.rotate270(),
        _ => img,
    };

    let (w, h) = (img.width(), img.height());
    let resized = if w > MAX_DIMENSION || h > MAX_DIMENSION {
        img.resize(
            MAX_DIMENSION,
            MAX_DIMENSION,
            image::imageops::FilterType::Triangle,
        )
    } else {
        img
    };

    let mut buf = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut buf, JPEG_QUALITY);
    resized
        .write_with_encoder(encoder)
        .map_err(|e| format!("Failed to encode {}: {e}", image_path.display()))?;

    let jpeg_bytes = buf.into_inner();
    log::info!(
        "Compressed {}: {}x{} -> {}x{}, {:.1} KB (orientation={})",
        image_path.file_name().unwrap_or_default().to_string_lossy(),
        w,
        h,
        resized.width(),
        resized.height(),
        jpeg_bytes.len() as f64 / 1024.0,
        orientation,
    );

    Ok(jpeg_bytes)
}

/// Check if exiftool is installed in the bundled tools directory.
pub fn find_bundled_exiftool(tools_dir: &Path) -> Option<PathBuf> {
    if !tools_dir.exists() {
        return None;
    }
    // Look for Image-ExifTool-*/exiftool inside tools_dir
    if let Ok(entries) = std::fs::read_dir(tools_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().starts_with("Image-ExifTool-") {
                let script = entry.path().join("exiftool");
                if script.is_file() {
                    return Some(script);
                }
            }
        }
    }
    None
}

/// Search for exiftool: bundled in app data first, then common macOS paths, then PATH.
pub fn find_exiftool(tools_dir: &Path) -> Option<String> {
    // Check bundled version first
    if let Some(bundled) = find_bundled_exiftool(tools_dir) {
        return Some(bundled.to_string_lossy().to_string());
    }
    // Known system paths (GUI .app bundles don't inherit shell PATH)
    let candidates = [
        "/opt/homebrew/bin/exiftool",
        "/usr/local/bin/exiftool",
        "/usr/bin/exiftool",
    ];
    for path in &candidates {
        if Path::new(path).is_file() {
            return Some(path.to_string());
        }
    }
    // Fall back to bare name in case PATH is set (e.g. dev mode)
    if Command::new("exiftool").arg("--version").output().is_ok() {
        return Some("exiftool".to_string());
    }
    None
}

/// Initialize the exiftool path cache. Call once during app startup or before first scan.
pub fn init_exiftool(tools_dir: &Path) {
    EXIFTOOL_PATH.get_or_init(|| find_exiftool(tools_dir));
}

/// Get the cached exiftool path.
fn get_exiftool() -> Option<&'static String> {
    EXIFTOOL_PATH.get().and_then(|o| o.as_ref())
}

fn extract_jpeg_from_raw(raw_path: &Path) -> Result<Vec<u8>, String> {
    let exiftool = get_exiftool().ok_or_else(|| {
        format!(
            "exiftool is not available. RAW files ({}) require exiftool.",
            raw_path.file_name().unwrap_or_default().to_string_lossy()
        )
    })?;

    let output = Command::new(&exiftool)
        .args(["-b", "-JpgFromRaw"])
        .arg(raw_path)
        .output()
        .map_err(|e| format!("Failed to execute exiftool: {e}"))?;

    if !output.status.success() || output.stdout.is_empty() {
        let fallback = Command::new(&exiftool)
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

/// Crop a face from an image given bounding box, resize to CROP_SIZE, encode as JPEG.
/// Returns JPEG bytes. The bbox is expanded by 30% for context.
pub fn crop_face_jpeg(image_bytes: &[u8], bbox: &[f32; 4]) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(image_bytes)
        .map_err(|e| format!("Failed to decode image for crop: {e}"))?;

    let (iw, ih) = (img.width() as f32, img.height() as f32);

    // Expand bbox by 30% for context
    let bw = bbox[2] - bbox[0];
    let bh = bbox[3] - bbox[1];
    let pad_x = bw * 0.3;
    let pad_y = bh * 0.3;

    let x1 = (bbox[0] - pad_x).max(0.0) as u32;
    let y1 = (bbox[1] - pad_y).max(0.0) as u32;
    let x2 = (bbox[2] + pad_x).min(iw) as u32;
    let y2 = (bbox[3] + pad_y).min(ih) as u32;

    let cw = x2.saturating_sub(x1).max(1);
    let ch = y2.saturating_sub(y1).max(1);

    let cropped = img.crop_imm(x1, y1, cw, ch);
    let resized = cropped.resize(CROP_SIZE, CROP_SIZE, image::imageops::FilterType::Triangle);

    let mut buf = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut buf, CROP_QUALITY);
    resized
        .write_with_encoder(encoder)
        .map_err(|e| format!("Failed to encode face crop: {e}"))?;

    Ok(buf.into_inner())
}
