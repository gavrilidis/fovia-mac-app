use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use r2d2::PooledConnection;
use r2d2_sqlite::SqliteConnectionManager;
use serde::{Deserialize, Serialize};
use sysinfo::Disks;
use tauri::{AppHandle, Emitter, Manager};

use crate::services::{activation, database, extractor, inference::FaceModels, scanner, xmp};

/// Maximum retries for transient inference failures.
const MAX_RETRIES: u32 = 3;

// ---- Shared state managed by Tauri ----

pub struct DbState(pub database::DbPool);
pub struct ModelState(pub Mutex<Option<FaceModels>>);

fn get_db_connection(
    app: &AppHandle,
) -> Result<PooledConnection<SqliteConnectionManager>, String> {
    let db = app.state::<DbState>();
    db.0.get()
        .map_err(|e| format!("Failed to get DB connection from pool: {e}"))
}

// ---- Data types (serialized to frontend) ----

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
    pub no_face_files: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VolumeInfo {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub is_removable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelStatus {
    pub models_ready: bool,
    pub det_model_exists: bool,
    pub rec_model_exists: bool,
    pub exiftool_ready: bool,
    pub models_dir: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhotoMeta {
    pub file_path: String,
    pub rating: i32,
    pub color_label: String,
    pub pick_status: String,
    pub quality_score: Option<f64>,
    pub blur_score: Option<f64>,
    pub closed_eyes: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagInfo {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExifData {
    pub camera_make: String,
    pub camera_model: String,
    pub lens: String,
    pub focal_length: String,
    pub aperture: String,
    pub shutter_speed: String,
    pub iso: String,
    pub date_taken: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportConfig {
    pub destination: String,
    pub rename_template: String,
    pub max_dimension: Option<u32>,
    pub jpeg_quality: Option<u8>,
    pub watermark_text: String,
    pub export_by_faces: bool,
    /// Map of person label → list of file paths belonging to that person.
    /// Only used when `export_by_faces` is true.
    pub face_groups: Option<Vec<FaceGroupExport>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FaceGroupExport {
    pub label: String,
    pub file_paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventGroup {
    pub id: String,
    pub name: String,
    pub start_time: String,
    pub end_time: String,
    pub file_paths: Vec<String>,
}

// ---- Commands ----

#[tauri::command]
pub fn list_volumes() -> Vec<VolumeInfo> {
    let disks = Disks::new_with_refreshed_list();
    let mut seen = HashSet::new();
    disks
        .iter()
        .filter_map(|disk| {
            let mount = disk.mount_point().to_string_lossy().to_string();
            if mount.starts_with("/System/Volumes") {
                return None;
            }
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

/// Read a photo file and return it as a base64-encoded JPEG (resized for viewing).
/// Used by the full-screen photo viewer to show the original image.
#[tauri::command]
pub fn read_photo_base64(file_path: String) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {file_path}"));
    }

    let image_bytes = extractor::extract_image_bytes(path)?;
    Ok(BASE64.encode(&image_bytes))
}

// ── Activation commands ──────────────────────────────────────────────

/// Check if the app is activated. Performs a background online license check
/// and falls back to a 30-day grace period when offline.
#[tauri::command]
pub async fn check_activation(app: AppHandle) -> Result<bool, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    if !activation::is_activated(&app_data) {
        return Ok(false);
    }

    // Read the stored key for background check
    let license_path = app_data.join("license.key");
    let key = std::fs::read_to_string(&license_path).unwrap_or_default();
    let key = key.trim().to_string();

    if key.is_empty() {
        return Ok(false);
    }

    // Try background online verification
    match activation::get_machine_id() {
        Ok(machine_id) => {
            match activation::background_check(&key, &machine_id).await {
                Ok(true) => {
                    // Online check passed — update local timestamp
                    activation::save_last_check(&app_data, &machine_id).ok();
                    log::info!("Online license check passed");
                }
                Ok(false) => {
                    // Key revoked or moved to another machine — deactivate
                    log::warn!("License no longer valid online, deactivating");
                    activation::remove_license(&app_data).ok();
                    return Ok(false);
                }
                Err(e) => {
                    // Network error — fall back to grace period
                    log::info!("Online check failed ({}), checking grace period", e);
                    if !activation::is_grace_period_valid(&app_data, &machine_id) {
                        log::warn!("Grace period expired, license invalid");
                        return Ok(false);
                    }
                    log::info!("Within grace period, allowing offline use");
                }
            }
        }
        Err(e) => {
            log::warn!("Could not get machine ID: {}, checking grace period", e);
            if !activation::is_grace_period_valid(&app_data, &machine_id) {
                return Ok(false);
            }
        }
    }

    Ok(true)
}

/// Attempt to activate with a serial key. Returns Ok(true) on success.
/// Validates the key format locally, then checks Supabase to ensure the key
/// is not already bound to a different machine.
#[tauri::command]
pub async fn activate_app(app: AppHandle, serial_key: String) -> Result<bool, String> {
    if !activation::validate_key(&serial_key) {
        return Ok(false);
    }

    // Get this Mac's hardware UUID
    let machine_id = activation::get_machine_id()?;

    // Online check: register or verify this key+machine pair
    activation::activate_online(&serial_key, &machine_id).await.map_err(|e| {
        if e.contains("Network error") || e.contains("timed out") || e.contains("dns") {
            "Internet connection is required for first activation. Please connect to the internet and try again.".to_string()
        } else {
            e
        }
    })?;

    // Passed online check — save locally
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    activation::save_license(&app_data, &serial_key)?;
    activation::save_last_check(&app_data, &machine_id).ok();
    log::info!("App activated successfully (machine: {})", machine_id);
    Ok(true)
}

/// Remove the license (deactivate the app).
#[tauri::command]
pub fn deactivate_app(app: AppHandle) -> Result<(), String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    activation::remove_license(&app_data)?;
    log::info!("App deactivated");
    Ok(())
}

/// Check whether ONNX models are downloaded and ready.
#[tauri::command]
pub fn check_models(app: AppHandle) -> Result<ModelStatus, String> {
    let models_dir = models_directory(&app)?;
    let det_exists = models_dir.join("det_10g.onnx").exists();
    let rec_exists = models_dir.join("w600k_r50.onnx").exists();
    let exiftool_ready = extractor::find_exiftool(&tools_directory(&app)?).is_some();

    Ok(ModelStatus {
        models_ready: det_exists && rec_exists,
        det_model_exists: det_exists,
        rec_model_exists: rec_exists,
        exiftool_ready,
        models_dir: models_dir.to_string_lossy().to_string(),
    })
}

/// Load ONNX models into memory (call after models are downloaded).
#[tauri::command]
pub fn load_models(app: AppHandle) -> Result<(), String> {
    let models_dir = models_directory(&app)?;
    let models = FaceModels::load(&models_dir)?;

    // Also initialize exiftool path cache
    let tools_dir = tools_directory(&app)?;
    extractor::init_exiftool(&tools_dir);

    let state = app.state::<ModelState>();
    let mut guard = state
        .0
        .lock()
        .map_err(|e| format!("Model lock poisoned: {e}"))?;
    *guard = Some(models);

    log::info!("Face models loaded successfully");
    Ok(())
}

const BUFFALO_URL: &str =
    "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip";
const REQUIRED_MODELS: [&str; 2] = ["det_10g.onnx", "w600k_r50.onnx"];

/// Progress payload emitted during model download.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub phase: String, // "downloading" | "extracting" | "done"
}

/// Download ONNX models from InsightFace GitHub releases with streaming progress.
#[tauri::command]
pub async fn download_models(app: AppHandle) -> Result<(), String> {
    use futures_util::StreamExt;

    let models_dir = models_directory(&app)?;
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Failed to create models dir: {e}"))?;

    // Skip if already downloaded
    if REQUIRED_MODELS.iter().all(|m| models_dir.join(m).exists()) {
        log::info!("Models already present, skipping download");
        return Ok(());
    }

    log::info!("Downloading models from {}", BUFFALO_URL);

    let response = reqwest::get(BUFFALO_URL)
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut data = Vec::with_capacity(total_bytes as usize);
    let mut stream = response.bytes_stream();

    // Stream download with progress events
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {e}"))?;
        downloaded += chunk.len() as u64;
        data.extend_from_slice(&chunk);

        // Emit progress every ~500KB to avoid flooding
        if downloaded % (512 * 1024) < chunk.len() as u64 || downloaded == total_bytes {
            app.emit(
                "model-download-progress",
                DownloadProgress {
                    downloaded_bytes: downloaded,
                    total_bytes,
                    phase: "downloading".to_string(),
                },
            )
            .ok();
        }
    }

    app.emit(
        "model-download-progress",
        DownloadProgress {
            downloaded_bytes: downloaded,
            total_bytes,
            phase: "extracting".to_string(),
        },
    )
    .ok();

    // Extract required models from zip
    let cursor = std::io::Cursor::new(&data);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to open zip: {e}"))?;

    for model_name in &REQUIRED_MODELS {
        let mut file = archive
            .by_name(model_name)
            .map_err(|e| format!("Model {model_name} not found in zip: {e}"))?;
        let out_path = models_dir.join(model_name);
        let mut out_file = std::fs::File::create(&out_path)
            .map_err(|e| format!("Failed to create {}: {e}", out_path.display()))?;
        std::io::copy(&mut file, &mut out_file)
            .map_err(|e| format!("Failed to extract {model_name}: {e}"))?;
        log::info!("Extracted {}", out_path.display());
    }

    app.emit(
        "model-download-progress",
        DownloadProgress {
            downloaded_bytes: downloaded,
            total_bytes,
            phase: "done".to_string(),
        },
    )
    .ok();
    log::info!("Models downloaded successfully to {}", models_dir.display());
    Ok(())
}

const EXIFTOOL_VERSION: &str = "13.55";

/// Candidate download URLs for exiftool, tried in order.
fn exiftool_download_urls() -> Vec<String> {
    vec![
        // Primary: exiftool.org (only hosts the latest version, may 404 for older)
        format!("https://exiftool.org/Image-ExifTool-{EXIFTOOL_VERSION}.tar.gz"),
        // Fallback: SourceForge (permanent archive of all versions)
        format!("https://sourceforge.net/projects/exiftool/files/Image-ExifTool-{EXIFTOOL_VERSION}.tar.gz/download"),
        // Fallback 2: GitHub mirror
        format!("https://github.com/exiftool/exiftool/archive/refs/tags/{EXIFTOOL_VERSION}.tar.gz"),
    ]
}

/// Download and install exiftool (Perl distribution) into app data directory.
#[tauri::command]
pub async fn download_exiftool(app: AppHandle) -> Result<(), String> {
    let tools_dir = tools_directory(&app)?;
    std::fs::create_dir_all(&tools_dir).map_err(|e| format!("Failed to create tools dir: {e}"))?;

    // Skip if already installed
    if extractor::find_bundled_exiftool(&tools_dir).is_some() {
        log::info!("exiftool already installed, skipping download");
        return Ok(());
    }

    app.emit(
        "model-download-progress",
        DownloadProgress {
            downloaded_bytes: 0,
            total_bytes: 0,
            phase: "downloading_exiftool".to_string(),
        },
    )
    .ok();

    // Try each URL until one succeeds
    let urls = exiftool_download_urls();
    let mut last_err = String::from("No download URLs configured");
    let mut data = None;

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    for url in &urls {
        log::info!("Trying exiftool download from {url}");
        match client.get(url).send().await {
            Ok(response) if response.status().is_success() => match response.bytes().await {
                Ok(bytes) => {
                    log::info!(
                        "exiftool downloaded successfully from {url} ({} bytes)",
                        bytes.len()
                    );
                    data = Some(bytes);
                    break;
                }
                Err(e) => {
                    last_err = format!("Failed to read response from {url}: {e}");
                    log::warn!("{last_err}");
                }
            },
            Ok(response) => {
                last_err = format!(
                    "exiftool download from {url} failed with status: {}",
                    response.status()
                );
                log::warn!("{last_err}");
            }
            Err(e) => {
                last_err = format!("Failed to connect to {url}: {e}");
                log::warn!("{last_err}");
            }
        }
    }

    let data = data.ok_or(format!(
        "All exiftool download sources failed. Last error: {last_err}"
    ))?;

    app.emit(
        "model-download-progress",
        DownloadProgress {
            downloaded_bytes: data.len() as u64,
            total_bytes: data.len() as u64,
            phase: "extracting_exiftool".to_string(),
        },
    )
    .ok();

    // Extract tar.gz
    let decoder = flate2::read::GzDecoder::new(std::io::Cursor::new(&data));
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(&tools_dir)
        .map_err(|e| format!("Failed to extract exiftool: {e}"))?;

    // Verify the exiftool script exists and is executable
    // exiftool.org archives use Image-ExifTool-{VERSION}/ directory
    // GitHub archives use exiftool-{VERSION}/ directory
    let exiftool_script = {
        let primary = tools_dir
            .join(format!("Image-ExifTool-{EXIFTOOL_VERSION}"))
            .join("exiftool");
        if primary.exists() {
            primary
        } else {
            let fallback = tools_dir
                .join(format!("exiftool-{EXIFTOOL_VERSION}"))
                .join("exiftool");
            if fallback.exists() {
                fallback
            } else {
                return Err("exiftool script not found after extraction".to_string());
            }
        }
    };

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&exiftool_script, perms)
            .map_err(|e| format!("Failed to set exiftool permissions: {e}"))?;
    }

    log::info!("exiftool installed at {}", exiftool_script.display());
    Ok(())
}

/// Load previously saved faces for a folder from the database.
#[tauri::command]
pub fn load_saved_faces(app: AppHandle, folder_path: String) -> Result<ScanResult, String> {
    let conn = get_db_connection(&app)?;

    let rows = database::load_faces_for_folder(&conn, &folder_path)?;

    let faces: Vec<FaceEntry> = rows
        .into_iter()
        .map(|r| {
            let embedding_json =
                serde_json::to_string(&r.embedding.iter().map(|v| *v as f64).collect::<Vec<_>>())
                    .unwrap_or_default();

            let preview_base64 = r
                .preview_jpeg
                .as_deref()
                .map(|bytes| BASE64.encode(bytes))
                .unwrap_or_default();

            FaceEntry {
                face_id: r.face_id,
                file_path: r.file_path,
                bbox_x1: r.bbox[0],
                bbox_y1: r.bbox[1],
                bbox_x2: r.bbox[2],
                bbox_y2: r.bbox[3],
                embedding: embedding_json,
                detection_score: r.detection_score,
                preview_base64,
            }
        })
        .collect();

    let total_faces = faces.len();
    Ok(ScanResult {
        faces,
        total_files: 0,
        total_faces,
        no_face_files: Vec::new(),
    })
}

fn emit_progress(app: &AppHandle, progress: &ScanProgress) {
    let _ = app.emit("scan-progress", progress.clone());
}

#[tauri::command]
pub async fn scan_folder(
    app: AppHandle,
    folder_path: String,
    detection_threshold: f64,
) -> Result<ScanResult, String> {
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

    let scan_id = uuid::Uuid::new_v4().to_string();
    let threshold = detection_threshold as f32;

    // Determine which files need scanning (incremental)
    let files_to_scan: Vec<PathBuf> = {
        let conn = get_db_connection(&app)?;

        image_files
            .iter()
            .filter(|path| {
                let path_str = path.to_string_lossy().to_string();
                // Include threshold in hash so changing it forces re-scan
                let current_hash = format!("{}:t{:.2}", fast_file_hash(path), threshold);
                match database::get_file_hash(&conn, &path_str) {
                    Ok(Some(saved_hash)) => saved_hash != current_hash,
                    _ => true, // Not scanned yet or error → scan it
                }
            })
            .cloned()
            .collect()
    };

    let new_file_count = files_to_scan.len();
    log::info!(
        "Incremental scan: {} total files, {} new/changed, {} cached",
        total_files,
        new_file_count,
        total_files - new_file_count,
    );

    // Create scan record BEFORE inserting faces (FK constraint)
    {
        let conn = get_db_connection(&app)?;
        database::insert_scan(&conn, &scan_id, &folder_path, total_files, 0)?;
    }

    // Emit initial progress so frontend shows ProgressView immediately
    emit_progress(
        &app,
        &ScanProgress {
            total_files: if new_file_count > 0 {
                new_file_count
            } else {
                total_files
            },
            processed: 0,
            current_file: if new_file_count > 0 {
                "Starting...".to_string()
            } else {
                "Loading cached results...".to_string()
            },
            faces_found: 0,
            errors: 0,
            last_error: String::new(),
            phase: "scanning".to_string(),
            files_read: 0,
        },
    );
    tokio::task::yield_now().await;

    let mut all_faces: Vec<FaceEntry> = Vec::new();
    let mut processed = 0usize;
    let mut error_count = 0usize;
    let mut last_error = String::new();

    // Process files in batches for progress reporting
    for (file_idx, path) in files_to_scan.iter().enumerate() {
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
        let needs_exiftool = scanner::needs_exiftool(&ext);
        let read_phase = if needs_exiftool {
            "scanning"
        } else {
            "compressing"
        };

        emit_progress(
            &app,
            &ScanProgress {
                total_files: new_file_count,
                processed,
                current_file: filename.clone(),
                faces_found: all_faces.len(),
                errors: error_count,
                last_error: last_error.clone(),
                phase: read_phase.to_string(),
                files_read: file_idx,
            },
        );
        tokio::task::yield_now().await;

        // Extract image bytes
        let image_bytes = match extractor::extract_image_bytes(path) {
            Ok(data) => {
                log::info!("Extracted {} bytes for {}", data.len(), filename);
                data
            }
            Err(e) => {
                log::warn!("Skipping {}: {e}", path.display());
                error_count += 1;
                last_error = e;
                continue;
            }
        };

        // Show detecting phase
        emit_progress(
            &app,
            &ScanProgress {
                total_files: new_file_count,
                processed,
                current_file: filename.clone(),
                faces_found: all_faces.len(),
                errors: error_count,
                last_error: last_error.clone(),
                phase: "detecting".to_string(),
                files_read: file_idx + 1,
            },
        );
        tokio::task::yield_now().await;

        // Run local inference with retry
        let detected = {
            let model_state = app.state::<ModelState>();
            let mut guard = model_state
                .0
                .lock()
                .map_err(|e| format!("Model lock poisoned: {e}"))?;
            let models = guard
                .as_mut()
                .ok_or("Models not loaded. Please download models first.")?;

            retry_inference(models, &image_bytes, threshold)?
        };

        log::info!(
            "Detection result for {}: {} faces (threshold={:.2})",
            filename,
            detected.len(),
            threshold
        );

        let file_path_str = path.to_string_lossy().to_string();

        // Delete old face data for this file before inserting new results
        {
            let conn = get_db_connection(&app)?;
            database::delete_faces_for_file(&conn, &file_path_str)?;
        }

        // Process each detected face
        for face in &detected {
            let face_id = uuid::Uuid::new_v4().to_string();
            let embedding_json = serde_json::to_string(
                &face.embedding.iter().map(|v| *v as f64).collect::<Vec<_>>(),
            )
            .unwrap_or_default();

            // Crop face from image (256x256 JPEG, ~15KB instead of full image ~150KB)
            let crop_jpeg = extractor::crop_face_jpeg(&image_bytes, &face.bbox).ok();
            let preview_base64 = crop_jpeg
                .as_deref()
                .map(|bytes| BASE64.encode(bytes))
                .unwrap_or_default();

            let bbox_f64 = [
                face.bbox[0] as f64,
                face.bbox[1] as f64,
                face.bbox[2] as f64,
                face.bbox[3] as f64,
            ];

            // Save to database
            {
                let conn = get_db_connection(&app)?;

                database::insert_face(
                    &conn,
                    &face_id,
                    &scan_id,
                    &file_path_str,
                    &bbox_f64,
                    &face.embedding,
                    face.score as f64,
                    crop_jpeg.as_deref(),
                )?;
            }

            all_faces.push(FaceEntry {
                face_id,
                file_path: file_path_str.clone(),
                bbox_x1: bbox_f64[0],
                bbox_y1: bbox_f64[1],
                bbox_x2: bbox_f64[2],
                bbox_y2: bbox_f64[3],
                embedding: embedding_json,
                detection_score: face.score as f64,
                preview_base64,
            });
        }

        // Mark file as scanned
        {
            let conn = get_db_connection(&app)?;

            let file_hash = format!("{}:t{:.2}", fast_file_hash(path), threshold);
            database::insert_scanned_file(&conn, &file_path_str, &scan_id, &file_hash)?;
        }

        // Compute quality metrics (blur + closed eyes) and persist
        {
            let blur = compute_blur_from_bytes(&image_bytes).unwrap_or(0.0);
            let has_closed_eyes = detected
                .iter()
                .any(|f| is_eyes_closed(&image_bytes, &f.landmarks));

            let conn = get_db_connection(&app)?;
            database::set_quality_metrics(&conn, &file_path_str, blur, blur, has_closed_eyes)?;
        }

        processed += 1;
    }

    // Load all faces (newly scanned + previously cached) and update scan totals
    let cached_faces = {
        let conn = get_db_connection(&app)?;

        // Update scan record with final face count
        database::update_scan_totals(&conn, &scan_id, total_files, all_faces.len())?;

        // Load ALL faces for this folder (including previously scanned)
        let all_rows = database::load_faces_for_folder(&conn, &folder_path)?;
        all_rows
            .into_iter()
            .map(|r| {
                let embedding_json = serde_json::to_string(
                    &r.embedding.iter().map(|v| *v as f64).collect::<Vec<_>>(),
                )
                .unwrap_or_default();

                let preview_base64 = r
                    .preview_jpeg
                    .as_deref()
                    .map(|bytes| BASE64.encode(bytes))
                    .unwrap_or_default();

                FaceEntry {
                    face_id: r.face_id,
                    file_path: r.file_path,
                    bbox_x1: r.bbox[0],
                    bbox_y1: r.bbox[1],
                    bbox_x2: r.bbox[2],
                    bbox_y2: r.bbox[3],
                    embedding: embedding_json,
                    detection_score: r.detection_score,
                    preview_base64,
                }
            })
            .collect::<Vec<_>>()
    };

    // Compute files without any detected faces
    let files_with_faces: HashSet<String> =
        cached_faces.iter().map(|f| f.file_path.clone()).collect();
    let no_face_files: Vec<String> = image_files
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .filter(|p| !files_with_faces.contains(p))
        .collect();

    let total_faces = cached_faces.len();
    let result = ScanResult {
        total_files,
        total_faces,
        faces: cached_faces,
        no_face_files,
    };

    Ok(result)
}

// ---- Photo metadata commands ----

#[tauri::command]
pub fn set_photo_rating(
    app: AppHandle,
    file_paths: Vec<String>,
    rating: i32,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    for fp in &file_paths {
        database::set_rating(&conn, fp, rating)?;
        // Write XMP sidecar with current metadata
        let meta = database::get_photo_metadata(&conn, fp)?;
        if let Some(m) = meta {
            if let Err(e) = xmp::write_xmp_sidecar(fp, m.rating, &m.color_label, &m.pick_status) {
                log::warn!("XMP sidecar write failed for {fp}: {e}");
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_photo_color_label(
    app: AppHandle,
    file_paths: Vec<String>,
    label: String,
) -> Result<(), String> {
    let valid = ["none", "red", "yellow", "green", "blue", "purple"];
    if !valid.contains(&label.as_str()) {
        return Err(format!("Invalid color label: {label}"));
    }
    let conn = get_db_connection(&app)?;
    for fp in &file_paths {
        database::set_color_label(&conn, fp, &label)?;
        let meta = database::get_photo_metadata(&conn, fp)?;
        if let Some(m) = meta {
            if let Err(e) = xmp::write_xmp_sidecar(fp, m.rating, &m.color_label, &m.pick_status) {
                log::warn!("XMP sidecar write failed for {fp}: {e}");
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_photo_pick_status(
    app: AppHandle,
    file_paths: Vec<String>,
    status: String,
) -> Result<(), String> {
    let valid = ["none", "pick", "reject"];
    if !valid.contains(&status.as_str()) {
        return Err(format!("Invalid pick status: {status}"));
    }
    let conn = get_db_connection(&app)?;
    for fp in &file_paths {
        database::set_pick_status(&conn, fp, &status)?;
        let meta = database::get_photo_metadata(&conn, fp)?;
        if let Some(m) = meta {
            if let Err(e) = xmp::write_xmp_sidecar(fp, m.rating, &m.color_label, &m.pick_status) {
                log::warn!("XMP sidecar write failed for {fp}: {e}");
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_photo_metadata(
    app: AppHandle,
    file_paths: Vec<String>,
) -> Result<Vec<PhotoMeta>, String> {
    let conn = get_db_connection(&app)?;
    let rows = database::get_all_photo_metadata(&conn, &file_paths)?;
    Ok(rows
        .into_iter()
        .map(|r| PhotoMeta {
            file_path: r.file_path,
            rating: r.rating,
            color_label: r.color_label,
            pick_status: r.pick_status,
            quality_score: r.quality_score,
            blur_score: r.blur_score,
            closed_eyes: r.closed_eyes,
        })
        .collect())
}

// ---- Tag commands ----

#[tauri::command]
pub fn create_tag(app: AppHandle, name: String) -> Result<TagInfo, String> {
    let conn = get_db_connection(&app)?;
    let id = database::create_tag(&conn, &name)?;
    Ok(TagInfo { id, name })
}

#[tauri::command]
pub fn delete_tag(app: AppHandle, tag_id: i64) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    database::delete_tag(&conn, tag_id)
}

#[tauri::command]
pub fn list_tags(app: AppHandle) -> Result<Vec<TagInfo>, String> {
    let conn = get_db_connection(&app)?;
    let tags = database::list_tags(&conn)?;
    Ok(tags
        .into_iter()
        .map(|(id, name)| TagInfo { id, name })
        .collect())
}

#[tauri::command]
pub fn add_photo_tag(app: AppHandle, file_paths: Vec<String>, tag_id: i64) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    for fp in &file_paths {
        database::add_photo_tag(&conn, fp, tag_id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_photo_tag(
    app: AppHandle,
    file_paths: Vec<String>,
    tag_id: i64,
) -> Result<(), String> {
    let conn = get_db_connection(&app)?;
    for fp in &file_paths {
        database::remove_photo_tag(&conn, fp, tag_id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_photo_tags(app: AppHandle, file_path: String) -> Result<Vec<TagInfo>, String> {
    let conn = get_db_connection(&app)?;
    let tags = database::get_tags_for_photo(&conn, &file_path)?;
    Ok(tags
        .into_iter()
        .map(|(id, name)| TagInfo { id, name })
        .collect())
}

// ---- EXIF metadata ----

#[tauri::command]
pub fn read_exif_metadata(file_path: String) -> Result<ExifData, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {file_path}"));
    }

    let raw_bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;

    let mut cursor = std::io::Cursor::new(&raw_bytes);
    let exif_reader = exif::Reader::new();
    let exif_data = exif_reader.read_from_container(&mut cursor);

    // Try to get image dimensions
    let (width, height) = image::image_dimensions(path).unwrap_or((0, 0));

    match exif_data {
        Ok(data) => {
            let get_str = |tag: exif::Tag| -> String {
                data.get_field(tag, exif::In::PRIMARY)
                    .map(|f| f.display_value().to_string())
                    .unwrap_or_default()
            };

            Ok(ExifData {
                camera_make: get_str(exif::Tag::Make).trim_matches('"').to_string(),
                camera_model: get_str(exif::Tag::Model).trim_matches('"').to_string(),
                lens: get_str(exif::Tag::LensModel).trim_matches('"').to_string(),
                focal_length: get_str(exif::Tag::FocalLength),
                aperture: get_str(exif::Tag::FNumber),
                shutter_speed: get_str(exif::Tag::ExposureTime),
                iso: get_str(exif::Tag::PhotographicSensitivity),
                date_taken: get_str(exif::Tag::DateTimeOriginal)
                    .trim_matches('"')
                    .to_string(),
                width,
                height,
            })
        }
        Err(_) => Ok(ExifData {
            camera_make: String::new(),
            camera_model: String::new(),
            lens: String::new(),
            focal_length: String::new(),
            aperture: String::new(),
            shutter_speed: String::new(),
            iso: String::new(),
            date_taken: String::new(),
            width,
            height,
        }),
    }
}

// ---- Quality detection ----

#[tauri::command]
pub fn compute_blur_score(file_path: String) -> Result<f64, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {file_path}"));
    }

    let raw_bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;

    let img = image::load_from_memory(&raw_bytes)
        .map_err(|e| format!("Failed to decode image: {e}"))?
        .to_luma8();

    // Laplacian variance — higher = sharper, lower = blurrier
    let (w, h) = (img.width() as i64, img.height() as i64);
    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut count = 0u64;

    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            let center = img.get_pixel(x as u32, y as u32)[0] as f64;
            let top = img.get_pixel(x as u32, (y - 1) as u32)[0] as f64;
            let bottom = img.get_pixel(x as u32, (y + 1) as u32)[0] as f64;
            let left = img.get_pixel((x - 1) as u32, y as u32)[0] as f64;
            let right = img.get_pixel((x + 1) as u32, y as u32)[0] as f64;
            let laplacian = -4.0 * center + top + bottom + left + right;
            sum += laplacian;
            sum_sq += laplacian * laplacian;
            count += 1;
        }
    }

    if count == 0 {
        return Ok(0.0);
    }

    let mean = sum / count as f64;
    let variance = (sum_sq / count as f64) - (mean * mean);
    Ok(variance)
}

// ---- Export ----

#[tauri::command]
pub async fn export_photos(file_paths: Vec<String>, config: ExportConfig) -> Result<usize, String> {
    let dest = PathBuf::from(&config.destination);
    if !dest.exists() {
        std::fs::create_dir_all(&dest).map_err(|e| format!("Failed to create destination: {e}"))?;
    }

    // When exporting by faces, build a mapping: file_path → subfolder label
    let face_folder_map: std::collections::HashMap<String, String> = if config.export_by_faces {
        let mut map = std::collections::HashMap::new();
        if let Some(groups) = &config.face_groups {
            for group in groups {
                for fp in &group.file_paths {
                    map.insert(fp.clone(), group.label.clone());
                }
            }
        }
        map
    } else {
        std::collections::HashMap::new()
    };

    let mut exported = 0usize;
    for (i, src_path) in file_paths.iter().enumerate() {
        let src = std::path::Path::new(src_path);
        if !src.exists() {
            log::warn!("Export: skipping missing file {}", src_path);
            continue;
        }

        // Determine output directory (subfolder per face when enabled)
        let out_dir = if config.export_by_faces {
            if let Some(label) = face_folder_map.get(src_path) {
                let sub = dest.join(label);
                if !sub.exists() {
                    std::fs::create_dir_all(&sub)
                        .map_err(|e| format!("Failed to create subfolder: {e}"))?;
                }
                sub
            } else {
                let sub = dest.join("Unsorted");
                if !sub.exists() {
                    std::fs::create_dir_all(&sub)
                        .map_err(|e| format!("Failed to create Unsorted folder: {e}"))?;
                }
                sub
            }
        } else {
            dest.clone()
        };

        // Determine output filename
        let original_name = src
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ext = src
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let output_name = if config.rename_template.is_empty() {
            format!("{original_name}.{ext}")
        } else {
            config
                .rename_template
                .replace("{name}", &original_name)
                .replace("{n}", &format!("{:04}", i + 1))
                .replace("{ext}", &ext)
        };

        let output_path = out_dir.join(&output_name);

        if config.max_dimension.is_some() || !config.watermark_text.is_empty() {
            // Need to process the image (resize / watermark)
            let raw_bytes =
                std::fs::read(src).map_err(|e| format!("Failed to read {}: {e}", src_path))?;
            let mut img = image::load_from_memory(&raw_bytes)
                .map_err(|e| format!("Failed to decode {}: {e}", src_path))?;

            if let Some(max_dim) = config.max_dimension {
                if img.width() > max_dim || img.height() > max_dim {
                    img = img.resize(max_dim, max_dim, image::imageops::FilterType::Lanczos3);
                }
            }

            // Apply watermark text (bottom-right, semi-transparent white)
            if !config.watermark_text.is_empty() {
                apply_watermark(&mut img, &config.watermark_text);
            }

            let quality = config.jpeg_quality.unwrap_or(90);
            let mut buf = std::io::Cursor::new(Vec::new());
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
            img.write_with_encoder(encoder)
                .map_err(|e| format!("Failed to encode {}: {e}", src_path))?;

            let jpeg_path = output_path.with_extension("jpg");
            std::fs::write(&jpeg_path, buf.into_inner())
                .map_err(|e| format!("Failed to write {}: {e}", jpeg_path.display()))?;
        } else {
            // Simple copy
            std::fs::copy(src, &output_path)
                .map_err(|e| format!("Failed to copy {}: {e}", src_path))?;
        }

        exported += 1;
    }

    Ok(exported)
}

/// Burn a text watermark into the bottom-right corner of an image.
/// Uses pixel-level rendering (no external font crate) — draws each ASCII
/// character as a simple 5x7 bitmap glyph, scaled to ~2% of image height.
fn apply_watermark(img: &mut image::DynamicImage, text: &str) {
    let (iw, ih) = (img.width(), img.height());
    let glyph_h = ((ih as f32) * 0.02).max(10.0) as u32;
    let glyph_w = (glyph_h as f32 * 0.6) as u32;
    let spacing = (glyph_w as f32 * 0.2) as u32;
    let padding = glyph_h;

    let text_width = text.len() as u32 * (glyph_w + spacing);
    let start_x = iw.saturating_sub(text_width + padding);
    let start_y = ih.saturating_sub(glyph_h + padding);

    let rgba = img.as_mut_rgba8();
    if let Some(buf) = rgba {
        for (ci, ch) in text.chars().enumerate() {
            let cx = start_x + ci as u32 * (glyph_w + spacing);
            let bitmap = char_bitmap(ch);
            for row in 0..7u32 {
                for col in 0..5u32 {
                    if bitmap[row as usize] & (1 << (4 - col)) != 0 {
                        let px = cx + col * glyph_w / 5;
                        let py = start_y + row * glyph_h / 7;
                        for dy in 0..(glyph_h / 7).max(1) {
                            for dx in 0..(glyph_w / 5).max(1) {
                                let x = px + dx;
                                let y = py + dy;
                                if x < iw && y < ih {
                                    let pixel = buf.get_pixel_mut(x, y);
                                    // Semi-transparent white overlay (alpha blend)
                                    let alpha = 180u8;
                                    pixel[0] = ((pixel[0] as u16 * (255 - alpha as u16)
                                        + 255 * alpha as u16)
                                        / 255) as u8;
                                    pixel[1] = ((pixel[1] as u16 * (255 - alpha as u16)
                                        + 255 * alpha as u16)
                                        / 255) as u8;
                                    pixel[2] = ((pixel[2] as u16 * (255 - alpha as u16)
                                        + 255 * alpha as u16)
                                        / 255) as u8;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Simple 5x7 bitmap font for ASCII printable characters.
/// Each u8 is a row of 5 bits (MSB = leftmost pixel).
fn char_bitmap(c: char) -> [u8; 7] {
    match c {
        'A' | 'a' => [
            0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001,
        ],
        'B' | 'b' => [
            0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110,
        ],
        'C' | 'c' => [
            0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110,
        ],
        'D' | 'd' => [
            0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110,
        ],
        'E' | 'e' => [
            0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111,
        ],
        'F' | 'f' => [
            0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000,
        ],
        'G' | 'g' => [
            0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110,
        ],
        'H' | 'h' => [
            0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001,
        ],
        'I' | 'i' => [
            0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110,
        ],
        'J' | 'j' => [
            0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100,
        ],
        'K' | 'k' => [
            0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001,
        ],
        'L' | 'l' => [
            0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111,
        ],
        'M' | 'm' => [
            0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001,
        ],
        'N' | 'n' => [
            0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001,
        ],
        'O' | 'o' => [
            0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110,
        ],
        'P' | 'p' => [
            0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000,
        ],
        'Q' | 'q' => [
            0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101,
        ],
        'R' | 'r' => [
            0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001,
        ],
        'S' | 's' => [
            0b01110, 0b10001, 0b10000, 0b01110, 0b00001, 0b10001, 0b01110,
        ],
        'T' | 't' => [
            0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100,
        ],
        'U' | 'u' => [
            0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110,
        ],
        'V' | 'v' => [
            0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100,
        ],
        'W' | 'w' => [
            0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001,
        ],
        'X' | 'x' => [
            0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001,
        ],
        'Y' | 'y' => [
            0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100,
        ],
        'Z' | 'z' => [
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111,
        ],
        '0' => [
            0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110,
        ],
        '1' => [
            0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110,
        ],
        '2' => [
            0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111,
        ],
        '3' => [
            0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110,
        ],
        '4' => [
            0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010,
        ],
        '5' => [
            0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110,
        ],
        '6' => [
            0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110,
        ],
        '7' => [
            0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000,
        ],
        '8' => [
            0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110,
        ],
        '9' => [
            0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110,
        ],
        ' ' => [
            0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000,
        ],
        '.' => [
            0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100,
        ],
        '-' => [
            0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000,
        ],
        '@' => [
            0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01110,
        ],
        _ => [
            0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100,
        ], // '?' fallback
    }
}

// ---- Event grouping ----

#[tauri::command]
pub fn auto_group_by_event(
    file_paths: Vec<String>,
    gap_minutes: u64,
) -> Result<Vec<EventGroup>, String> {
    // Read EXIF date from each file and sort by date
    let mut dated: Vec<(String, String)> = Vec::new();
    for fp in &file_paths {
        let path = std::path::Path::new(fp);
        if !path.exists() {
            continue;
        }

        let date = if let Ok(bytes) = std::fs::read(path) {
            let mut cursor = std::io::Cursor::new(&bytes);
            let reader = exif::Reader::new();
            reader
                .read_from_container(&mut cursor)
                .ok()
                .and_then(|data| {
                    data.get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
                        .map(|f| f.display_value().to_string().trim_matches('"').to_string())
                })
                .unwrap_or_default()
        } else {
            String::new()
        };

        if !date.is_empty() {
            dated.push((fp.clone(), date));
        }
    }

    // Sort by date
    dated.sort_by(|a, b| a.1.cmp(&b.1));

    if dated.is_empty() {
        return Ok(Vec::new());
    }

    // Group by time gaps
    let gap_seconds = gap_minutes * 60;
    let mut groups: Vec<EventGroup> = Vec::new();
    let mut current_files: Vec<String> = vec![dated[0].0.clone()];
    let mut current_start = dated[0].1.clone();

    for i in 1..dated.len() {
        let prev_ts = parse_exif_datetime(&dated[i - 1].1);
        let curr_ts = parse_exif_datetime(&dated[i].1);

        if let (Some(prev), Some(curr)) = (prev_ts, curr_ts) {
            if curr.saturating_sub(prev) > gap_seconds {
                // Close current group
                let group_id = uuid::Uuid::new_v4().to_string();
                let end_time = dated[i - 1].1.clone();
                groups.push(EventGroup {
                    id: group_id,
                    name: format!("Event {}", groups.len() + 1),
                    start_time: current_start.clone(),
                    end_time,
                    file_paths: current_files.clone(),
                });
                current_files = Vec::new();
                current_start = dated[i].1.clone();
            }
        }
        current_files.push(dated[i].0.clone());
    }

    // Final group
    if !current_files.is_empty() {
        let group_id = uuid::Uuid::new_v4().to_string();
        let end_time = dated.last().map(|d| d.1.clone()).unwrap_or_default();
        groups.push(EventGroup {
            id: group_id,
            name: format!("Event {}", groups.len() + 1),
            start_time: current_start,
            end_time,
            file_paths: current_files,
        });
    }

    Ok(groups)
}

// ---- Helpers ----

fn models_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(app_data.join("models"))
}

fn tools_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    Ok(app_data.join("tools"))
}

/// Fast file identity hash: combines file size and modification time.
/// Not a cryptographic hash — used only for change detection.
fn fast_file_hash(path: &PathBuf) -> String {
    match std::fs::metadata(path) {
        Ok(meta) => {
            let size = meta.len();
            let modified = meta
                .modified()
                .map(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()
                })
                .unwrap_or(0);
            format!("{size}:{modified}")
        }
        Err(_) => String::new(),
    }
}

/// Retry inference with exponential backoff for transient failures.
fn retry_inference(
    models: &mut FaceModels,
    image_bytes: &[u8],
    threshold: f32,
) -> Result<Vec<crate::services::inference::DetectedFace>, String> {
    let mut last_err = String::new();

    for attempt in 0..MAX_RETRIES {
        match models.detect_faces(image_bytes, threshold) {
            Ok(faces) => return Ok(faces),
            Err(e) => {
                last_err = e;
                if attempt + 1 < MAX_RETRIES {
                    log::warn!(
                        "Inference attempt {} failed: {}. Retrying...",
                        attempt + 1,
                        last_err
                    );
                    std::thread::sleep(std::time::Duration::from_millis(100 * 2u64.pow(attempt)));
                }
            }
        }
    }

    Err(format!(
        "Inference failed after {MAX_RETRIES} attempts: {last_err}"
    ))
}

/// Parse EXIF datetime string (e.g., "2024-01-15 14:30:00" or "2024:01:15 14:30:00") to Unix timestamp.
fn parse_exif_datetime(dt: &str) -> Option<u64> {
    // EXIF uses "YYYY:MM:DD HH:MM:SS" format
    let normalized = dt.replacen(':', "-", 2); // Fix date separators: "2024:01:15" -> "2024-01-15"
                                               // Simple parsing: extract year, month, day, hour, min, sec
    let parts: Vec<&str> = normalized
        .split(|c: char| !c.is_ascii_digit())
        .filter(|s| !s.is_empty())
        .collect();
    if parts.len() < 6 {
        return None;
    }
    let year: u64 = parts[0].parse().ok()?;
    let month: u64 = parts[1].parse().ok()?;
    let day: u64 = parts[2].parse().ok()?;
    let hour: u64 = parts[3].parse().ok()?;
    let min: u64 = parts[4].parse().ok()?;
    let sec: u64 = parts[5].parse().ok()?;

    // Approximate Unix timestamp (doesn't need to be exact, just consistent for gap detection)
    let days = (year - 1970) * 365 + (month - 1) * 30 + day;
    Some(days * 86400 + hour * 3600 + min * 60 + sec)
}

/// Compute Laplacian variance (blur score) directly from in-memory JPEG bytes.
fn compute_blur_from_bytes(image_bytes: &[u8]) -> Result<f64, String> {
    let img = image::load_from_memory(image_bytes)
        .map_err(|e| format!("Failed to decode image for blur: {e}"))?
        .to_luma8();

    let (w, h) = (img.width() as i64, img.height() as i64);
    if w < 3 || h < 3 {
        return Ok(0.0);
    }

    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut count = 0u64;

    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            let center = img.get_pixel(x as u32, y as u32)[0] as f64;
            let top = img.get_pixel(x as u32, (y - 1) as u32)[0] as f64;
            let bottom = img.get_pixel(x as u32, (y + 1) as u32)[0] as f64;
            let left = img.get_pixel((x - 1) as u32, y as u32)[0] as f64;
            let right = img.get_pixel((x + 1) as u32, y as u32)[0] as f64;
            let laplacian = -4.0 * center + top + bottom + left + right;
            sum += laplacian;
            sum_sq += laplacian * laplacian;
            count += 1;
        }
    }

    if count == 0 {
        return Ok(0.0);
    }
    let mean = sum / count as f64;
    Ok((sum_sq / count as f64) - (mean * mean))
}

/// Detect closed eyes by analysing the gradient variance in the eye regions
/// relative to the overall face region.
///
/// Landmarks: [0]=left-eye, [1]=right-eye, [2]=nose, [3]=left-mouth, [4]=right-mouth.
/// Closed eyes produce significantly smoother (lower variance) eye-region patches
/// compared to open eyes.
fn is_eyes_closed(image_bytes: &[u8], landmarks: &[[f32; 2]; 5]) -> bool {
    let img = match image::load_from_memory(image_bytes) {
        Ok(i) => i.to_luma8(),
        Err(_) => return false,
    };

    let (iw, ih) = (img.width() as f32, img.height() as f32);

    // Estimate eye-region size from inter-eye distance
    let eye_dist = ((landmarks[1][0] - landmarks[0][0]).powi(2)
        + (landmarks[1][1] - landmarks[0][1]).powi(2))
    .sqrt();
    let patch_half = (eye_dist * 0.25).max(4.0);

    let mut total_var = 0.0f64;
    let mut eye_count = 0;

    for eye_idx in 0..2 {
        let cx = landmarks[eye_idx][0];
        let cy = landmarks[eye_idx][1];

        let x1 = (cx - patch_half).max(0.0) as u32;
        let y1 = (cy - patch_half * 0.6).max(0.0) as u32;
        let x2 = ((cx + patch_half) as u32).min(img.width().saturating_sub(1));
        let y2 = ((cy + patch_half * 0.6) as u32).min(img.height().saturating_sub(1));

        if x2 <= x1 + 2 || y2 <= y1 + 2 {
            continue;
        }

        // Compute Laplacian variance in the eye patch
        let mut sum = 0.0f64;
        let mut sum_sq = 0.0f64;
        let mut n = 0u64;

        for y in (y1 + 1)..y2 {
            for x in (x1 + 1)..x2 {
                let c = img.get_pixel(x, y)[0] as f64;
                let t = img.get_pixel(x, y - 1)[0] as f64;
                let b = img.get_pixel(x, y + 1)[0] as f64;
                let l = img.get_pixel(x - 1, y)[0] as f64;
                let r = img.get_pixel(x + 1, y)[0] as f64;
                let lap = -4.0 * c + t + b + l + r;
                sum += lap;
                sum_sq += lap * lap;
                n += 1;
            }
        }

        if n > 0 {
            let mean = sum / n as f64;
            let var = (sum_sq / n as f64) - (mean * mean);
            total_var += var;
            eye_count += 1;
        }
    }

    if eye_count == 0 {
        return false;
    }

    let avg_eye_var = total_var / eye_count as f64;

    // Threshold: below this Laplacian variance in the eye region → likely closed.
    // Tuned empirically: open eyes have strong edge gradients (~200+),
    // closed eyes are smoother (~50-100).
    let _ = (iw, ih); // suppress unused
    avg_eye_var < 80.0
}
