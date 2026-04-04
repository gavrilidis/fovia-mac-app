use std::collections::HashSet;
use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use sysinfo::Disks;
use tauri::{AppHandle, Emitter};

use crate::services::{api_client::ApiClient, extractor, scanner};

const API_BASE_URL: &str = "http://127.0.0.1:8000";
/// Max total bytes per API batch (~10 MB). With local compression, each image
/// is typically 100-300 KB, so this allows ~30-50 images per batch.
const MAX_BATCH_BYTES: usize = 10_000_000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanProgress {
    pub total_files: usize,
    pub processed: usize,
    pub current_file: String,
    pub faces_found: usize,
    pub errors: usize,
    pub last_error: String,
    /// "scanning" | "compressing" | "detecting"
    pub phase: String,
    /// Number of files read/compressed so far (tracks pre-processing progress)
    pub files_read: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FaceEntry {
    pub face_id: String,
    pub file_path: String,
    pub bbox_x1: f64,
    pub bbox_y1: f64,
    pub bbox_x2: f64,
    pub bbox_y2: f64,
    pub embedding: String,
    pub detection_score: f64,
    pub preview_base64: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanResult {
    pub faces: Vec<FaceEntry>,
    pub total_files: usize,
    pub total_faces: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VolumeInfo {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub is_removable: bool,
}

#[tauri::command]
pub fn list_volumes() -> Vec<VolumeInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut seen = HashSet::new();
    disks
        .iter()
        .filter_map(|disk| {
            let mount = disk.mount_point().to_string_lossy().to_string();
            // Skip macOS internal system volumes
            if mount.starts_with("/System/Volumes") {
                return None;
            }
            // Deduplicate by mount point
            if !seen.insert(mount.clone()) {
                return None;
            }
            let name = disk.name().to_string_lossy().to_string();
            Some(VolumeInfo {
                name: if name.is_empty() { mount.clone() } else { name },
                mount_point: mount,
                total_bytes: disk.total_space(),
                available_bytes: disk.available_space(),
                is_removable: disk.is_removable(),
            })
        })
        .collect()
}

/// Open a file with the default macOS application
#[tauri::command]
pub fn open_file(file_path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&file_path)
        .spawn()
        .map_err(|e| format!("Failed to open file: {e}"))?;
    Ok(())
}

/// Reveal selected files in macOS Finder
#[tauri::command]
pub fn reveal_in_finder(file_paths: Vec<String>) -> Result<(), String> {
    if file_paths.is_empty() {
        return Err("No files selected".to_string());
    }
    // Use osascript to reveal and select files in Finder
    let apple_list: Vec<String> = file_paths
        .iter()
        .map(|p| format!("POSIX file \"{}\" as alias", p))
        .collect();
    let script = format!(
        "tell application \"Finder\"\nactivate\nreveal {{{}}}\nend tell",
        apple_list.join(", ")
    );
    std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("Failed to open Finder: {e}"))?;
    Ok(())
}

fn emit_progress(app: &AppHandle, progress: &ScanProgress) {
    let _ = app.emit("scan-progress", progress.clone());
}

#[tauri::command]
pub async fn scan_folder(app: AppHandle, folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Invalid folder: {folder_path}"));
    }

    // Phase 1: discover image files
    let image_files = scanner::find_image_files(&root);
    let total_files = image_files.len();

    if total_files == 0 {
        return Err("No image files found in the selected folder.".to_string());
    }

    let api = ApiClient::new(API_BASE_URL);
    let mut all_faces: Vec<FaceEntry> = Vec::new();
    let mut processed = 0usize;
    let mut error_count = 0usize;
    let mut last_error = String::new();

    // Build dynamically-sized batches based on total byte size
    let mut batch: Vec<(String, Vec<u8>)> = Vec::new();
    let mut batch_paths: Vec<String> = Vec::new();
    let mut batch_bytes = 0usize;

    for (file_idx, path) in image_files.iter().enumerate() {
        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let is_raw = scanner::is_raw_extension(&ext);

        // Show appropriate phase: "compressing" for standard images, "scanning" for RAW
        let read_phase = if is_raw { "scanning" } else { "compressing" };

        emit_progress(
            &app,
            &ScanProgress {
                total_files,
                processed,
                current_file: filename.clone(),
                faces_found: all_faces.len(),
                errors: error_count,
                last_error: last_error.clone(),
                phase: read_phase.to_string(),
                files_read: file_idx,
            },
        );

        match extractor::extract_image_bytes(path) {
            Ok(data) => {
                batch_bytes += data.len();
                batch_paths.push(path.to_string_lossy().to_string());
                batch.push((filename.clone(), data));
            }
            Err(e) => {
                log::warn!("Skipping {}: {e}", path.display());
            }
        }

        // Flush batch when byte limit reached or at the last file
        let is_last = file_idx + 1 == total_files;
        if !batch.is_empty() && (batch_bytes >= MAX_BATCH_BYTES || is_last) {
            let batch_file_count = batch.len();
            log::info!(
                "Sending batch of {} files ({:.1} MB) to API",
                batch_file_count,
                batch_bytes as f64 / 1_000_000.0,
            );

            // Show "detecting" phase while waiting for API
            emit_progress(
                &app,
                &ScanProgress {
                    total_files,
                    processed,
                    current_file: filename.clone(),
                    faces_found: all_faces.len(),
                    errors: error_count,
                    last_error: last_error.clone(),
                    phase: "detecting".to_string(),
                    files_read: file_idx + 1,
                },
            );

            let preview_data: Vec<Vec<u8>> = batch.iter().map(|(_, data)| data.clone()).collect();

            match api.extract_faces(&batch).await {
                Ok(response) => {
                    for face in response.faces {
                        let face_id = uuid::Uuid::new_v4().to_string();
                        let embedding_json =
                            serde_json::to_string(&face.embedding).unwrap_or_default();

                        let face_preview = if face.image_index < preview_data.len() {
                            BASE64.encode(&preview_data[face.image_index])
                        } else {
                            String::new()
                        };

                        let file_path = if face.image_index < batch_paths.len() {
                            batch_paths[face.image_index].clone()
                        } else {
                            String::new()
                        };

                        all_faces.push(FaceEntry {
                            face_id,
                            file_path,
                            bbox_x1: face.bbox.x1,
                            bbox_y1: face.bbox.y1,
                            bbox_x2: face.bbox.x2,
                            bbox_y2: face.bbox.y2,
                            embedding: embedding_json,
                            detection_score: face.detection_score,
                            preview_base64: face_preview,
                        });
                    }
                }
                Err(e) => {
                    log::error!("API batch error: {e}");
                    error_count += 1;
                    last_error = e;
                }
            }

            // Update processed count AFTER API call completes
            processed += batch_file_count;

            // Emit progress after detection result is known
            emit_progress(
                &app,
                &ScanProgress {
                    total_files,
                    processed,
                    current_file: filename.clone(),
                    faces_found: all_faces.len(),
                    errors: error_count,
                    last_error: last_error.clone(),
                    phase: "scanning".to_string(),
                    files_read: file_idx + 1,
                },
            );

            batch.clear();
            batch_paths.clear();
            batch_bytes = 0;
        }
    }

    let result = ScanResult {
        total_files,
        total_faces: all_faces.len(),
        faces: all_faces,
    };

    Ok(result)
}
