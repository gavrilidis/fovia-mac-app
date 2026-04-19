//! Native application menu for FaceFlow.
//!
//! macOS users expect the standard menu bar to be wired up with familiar
//! actions (File / Edit / View / Window / Help) and keyboard shortcuts. We
//! also expose every important in-app action here so power users can drive
//! the app without touching the mouse.
//!
//! Each non-system item emits a `faceflow:menu` event whose payload is the
//! item's id. The frontend listens for this event and dispatches the
//! corresponding action through the existing handler chain.

use tauri::{
    menu::{AboutMetadata, Menu, MenuBuilder, MenuItem, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Runtime,
};

/// Build the full application menu. Called once during `setup`.
pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // ---- App submenu (macOS shows the bundle name here automatically) ----
    let about_meta = AboutMetadata {
        name: Some("FaceFlow".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        copyright: Some("© 2026 FaceFlow".into()),
        ..Default::default()
    };
    let app_submenu = SubmenuBuilder::new(app, "FaceFlow")
        .item(&PredefinedMenuItem::about(
            app,
            Some("About FaceFlow"),
            Some(about_meta),
        )?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "preferences",
            "Settings…",
            true,
            Some("CmdOrCtrl+,"),
        )?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    // ---- File submenu ----
    let file_submenu = SubmenuBuilder::new(app, "File")
        .item(&MenuItem::with_id(
            app,
            "new_scan",
            "Open Folder…",
            true,
            Some("CmdOrCtrl+O"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "reset_scan",
            "Reset Current Library",
            true,
            Some("CmdOrCtrl+Shift+Backspace"),
        )?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "export",
            "Export Selected…",
            true,
            Some("CmdOrCtrl+E"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "export_xmp",
            "Export XMP Sidecars",
            true,
            Some("CmdOrCtrl+Shift+E"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "export_folder_summary",
            "Export Folder Summary (JSON)",
            true,
            None::<&str>,
        )?)
        .separator()
        .item(&PredefinedMenuItem::close_window(
            app,
            Some("Close Window"),
        )?)
        .build()?;

    // ---- Edit submenu ----
    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "find",
            "Find…",
            true,
            Some("CmdOrCtrl+F"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "select_all_photos",
            "Select All Photos",
            true,
            Some("CmdOrCtrl+A"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "deselect_all",
            "Deselect All",
            true,
            Some("CmdOrCtrl+Shift+A"),
        )?)
        .build()?;

    // ---- View submenu ----
    let view_submenu = SubmenuBuilder::new(app, "View")
        .item(&MenuItem::with_id(
            app,
            "view_grid",
            "Grid View",
            true,
            Some("CmdOrCtrl+1"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "view_list",
            "List View",
            true,
            Some("CmdOrCtrl+2"),
        )?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "zoom_in",
            "Larger Thumbnails",
            true,
            Some("CmdOrCtrl+="),
        )?)
        .item(&MenuItem::with_id(
            app,
            "zoom_out",
            "Smaller Thumbnails",
            true,
            Some("CmdOrCtrl+-"),
        )?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "toggle_compare",
            "Toggle Compare View",
            true,
            Some("CmdOrCtrl+K"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "toggle_exif",
            "Toggle EXIF Panel",
            true,
            Some("CmdOrCtrl+I"),
        )?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    // ---- Window submenu ----
    let window_submenu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .build()?;

    // ---- Help submenu ----
    let help_submenu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItem::with_id(
            app,
            "show_help",
            "FaceFlow Help",
            true,
            Some("CmdOrCtrl+?"),
        )?)
        .item(&MenuItem::with_id(
            app,
            "show_shortcuts",
            "Keyboard Shortcuts",
            true,
            Some("CmdOrCtrl+/"),
        )?)
        .separator()
        .item(&MenuItem::with_id(
            app,
            "show_onboarding",
            "Show Onboarding Tips",
            true,
            None::<&str>,
        )?)
        .item(&MenuItem::with_id(
            app,
            "report_issue",
            "Report an Issue…",
            true,
            None::<&str>,
        )?)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .item(&help_submenu)
        .build()?;

    Ok(menu)
}
