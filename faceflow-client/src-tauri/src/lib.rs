mod commands;
mod services;

use tauri::Manager;

use commands::scan::{DbState, ModelState};

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
            commands::scan::check_models,
            commands::scan::download_models,
            commands::scan::download_exiftool,
            commands::scan::load_models,
            commands::scan::load_saved_faces,
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
            services::secrets::save_secret,
            services::secrets::get_secret,
            services::secrets::delete_secret,
            services::clustering::cluster_faces_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
