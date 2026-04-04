use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use sysinfo::Disks;
use tauri::{AppHandle, Emitter};

use crate::services::{api_client::ApiClient, extractor, scanner};

const BATCH_SIZE: usize = 50;
const API_BASE_URL: &str = "http://127.0.0.1:8000";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanProgress {
    pub total_files: usize,
    pub processed: usize,
    pub current_file: String,
    pub faces_found: usize,
    pub errors: usize,
    pub last_error: String,
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
    disks
        .iter()
        .map(|disk| {
            let name = disk.name().to_string_lossy().to_string();
            let mount = disk.mount_point().to_string_lossy().to_string();
            VolumeInfo {
                name: if name.is_empty() { mount.clone() } else { name },
                mount_point: mount,
                total_bytes: disk.total_space(),
                available_bytes: disk.available_space(),
                is_removable: disk.is_removable(),
            }
        })
        .collect()
}

#[tauri::command]
pub async fn scan_folder(app: AppHandle, folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Invalid folder: {folder_path}"));
    }

    let raw_files = scanner::find_image_files(&root);
    let total_files = raw_files.len();

    if total_files == 0 {
        return Err("No image files found in the selected folder.".to_string());
    }

    let api = ApiClient::new(API_BASE_URL);
    let mut all_faces: Vec<FaceEntry> = Vec::new();
    let mut processed = 0usize;
    let mut error_count = 0usize;
    let mut last_error = String::new();

    for chunk in raw_files.chunks(BATCH_SIZE) {
        let mut batch: Vec<(String, Vec<u8>)> = Vec::new();
        let mut batch_paths: Vec<String> = Vec::new();

        for path in chunk {
            let filename = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            match extractor::extract_image_bytes(path) {
                Ok(jpeg_data) => {
                    batch_paths.push(path.to_string_lossy().to_string());
                    batch.push((filename, jpeg_data));
                }
                Err(e) => {
                    log::warn!("Skipping {}: {e}", path.display());
                }
            }

            processed += 1;
            let _ = app.emit(
                "scan-progress",
                ScanProgress {
                    total_files,
                    processed,
                    current_file: path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                    faces_found: all_faces.len(),
                    errors: error_count,
                    last_error: last_error.clone(),
                },
            );
        }

        if batch.is_empty() {
            continue;
        }

        // Store preview bytes for face cropping
        let preview_data: Vec<Vec<u8>> = batch.iter().map(|(_, data)| data.clone()).collect();

        match api.extract_faces(&batch).await {
            Ok(response) => {
                for face in response.faces {
                    let face_id = uuid::Uuid::new_v4().to_string();
                    let embedding_json = serde_json::to_string(&face.embedding).unwrap_or_default();

                    // Extract face crop from preview for avatar
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
    }

    let result = ScanResult {
        total_files,
        total_faces: all_faces.len(),
        faces: all_faces,
    };

    Ok(result)
}
