pub mod commands;
pub mod config;
pub mod menu;
pub mod network;
pub mod plugin_bridge;
pub mod process;
pub mod protocol;
pub mod shortcuts;
pub mod state;
pub mod tray;
pub mod updater;
pub mod window;

use std::sync::{Arc, Mutex};
use tauri::Manager;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let initial_config = config::load_initial_config(app.handle());
            let app_state = AppState {
                config: Arc::new(Mutex::new(initial_config.clone())),
                is_maximized: Arc::new(Mutex::new(false)),
            };
            app.manage(app_state);

            if let Some(window) = app.get_webview_window("main") {
                window::configure_window(&window, &initial_config);
            }

            let _ = menu::setup_menu(app.handle());
            let _ = tray::setup_tray(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::set_config,
            commands::window_set_size,
            commands::window_set_position,
            commands::window_maximize,
            commands::window_is_maximized,
            commands::window_set_always_on_top,
            commands::window_show,
            commands::window_hide,
            commands::window_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running pear desktop application");
}
