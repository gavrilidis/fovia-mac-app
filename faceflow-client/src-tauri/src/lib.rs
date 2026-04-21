mod commands;
mod menu;
mod services;

use std::sync::{atomic::AtomicBool, Arc};

use tauri::{Emitter, Manager};

use commands::scan::{DbState, ModelState, ScanCancellation};
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // TODO: Add Sentry crash reporting (tauri-plugin-sentry) after beta period.

            // Initialize SQLite database in app data directory
            let app_data = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {e}"))
                .expect("app data dir must be available");
            let db_path = app_data.join("faceflow.db");
            let pool =
                services::database::open_database(&db_path).expect("Failed to initialize database");

            app.manage(DbState(pool));
            app.manage(ModelState(std::sync::Mutex::new(None)));
            // Shared cancellation flag toggled by `cancel_scan` and polled
            // by `scan_folder` so the user can stop a long-running scan at
            // any time without losing already-saved progress.
            app.manage(ScanCancellation(Arc::new(AtomicBool::new(false))));

            // Native macOS menu (File / Edit / View / Window / Help) with
            // shortcuts. Items emit a `menu:<id>` event over the global
            // event bus that the frontend listens for.
            let app_menu = menu::build_app_menu(app.handle())?;
            app.set_menu(app_menu)?;
            app.on_menu_event(move |app, event| {
                let id = event.id().0.clone();
                let _ = app.emit("faceflow:menu", id);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan::check_activation,
            commands::scan::activate_app,
            commands::scan::deactivate_app,
            commands::scan::scan_folder,
            commands::scan::list_volumes,
            commands::scan::reveal_in_finder,
            commands::scan::open_file,
            commands::scan::open_url,
            commands::scan::get_storage_stats,
            commands::scan::vacuum_database,
            commands::scan::reveal_app_data_in_finder,
            commands::scan::open_app_window,
            commands::scan::export_folder_summary,
            commands::scan::check_models,
            commands::scan::download_models,
            commands::scan::download_exiftool,
            commands::scan::load_models,
            commands::scan::load_saved_faces,
            commands::scan::force_regroup_faces,
            commands::scan::read_photo_base64,
            commands::scan::set_photo_rating,
            commands::scan::set_photo_color_label,
            commands::scan::set_photo_pick_status,
            commands::scan::get_photo_metadata,
            commands::scan::create_tag,
            commands::scan::delete_tag,
            commands::scan::list_tags,
            commands::scan::add_photo_tag,
            commands::scan::remove_photo_tag,
            commands::scan::get_photo_tags,
            commands::scan::read_exif_metadata,
            commands::scan::compute_blur_score,
            commands::scan::export_photos,
            commands::scan::export_xmp_sidecars,
            commands::scan::auto_group_by_event,
            commands::scan::get_scan_progress,
            commands::scan::clear_scan_progress,
            commands::scan::cancel_scan,
            commands::scan::reset_folder_data,
            commands::scan::count_folder_scanned_files,
            services::secrets::save_secret,
            services::secrets::get_secret,
            services::secrets::delete_secret,
            services::clustering::cluster_faces_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
