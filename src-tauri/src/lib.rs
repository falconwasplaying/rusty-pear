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

            let css = include_str!("../../src/music-player.css");
            let mut init_script = format!(
                r#"(function() {{
                    try {{
                        if (window.self !== window.top) {{
                            return;
                        }}
                    }} catch (e) {{
                        return;
                    }}
                    if (window.__PEAR_INITIAL_CONFIG__) {{
                        return;
                    }}
                    window.__PEAR_INITIAL_CONFIG__ = {};
                    function injectCss() {{
                        if (document.head || document.documentElement) {{
                            var s = document.createElement('style');
                            s.id = 'pear-music-player-css';
                            s.textContent = {};
                            (document.head || document.documentElement).appendChild(s);
                        }} else {{
                            setTimeout(injectCss, 10);
                        }}
                    }}
                    injectCss();
                }})();"#,
                serde_json::to_string(&initial_config).unwrap_or_else(|_| "{}".to_string()),
                serde_json::to_string(css).unwrap_or_else(|_| "\"\"".to_string())
            );

            let renderer_code = std::fs::read_to_string("../dist/renderer/renderer.js")
                .or_else(|_| std::fs::read_to_string("dist/renderer/renderer.js"))
                .unwrap_or_else(|_| include_str!("../../dist/renderer/renderer.js").to_string());

            init_script.push('\n');
            init_script.push_str(r#"(function() {
                try {
                    if (window.self !== window.top) {
                        return;
                    }
                    if (window.__PEAR_RENDERER_LOADED__) {
                        return;
                    }
                    window.__PEAR_RENDERER_LOADED__ = true;
                } catch (e) {
                    return;
                }
            "#);
            init_script.push_str(&renderer_code);
            init_script.push_str("\n})();");

            let window = match app.get_webview_window("main") {
                Some(w) => w,
                None => {
                    let mut builder = tauri::WebviewWindowBuilder::new(
                        app,
                        "main",
                        tauri::WebviewUrl::External("https://music.youtube.com".parse().unwrap()),
                    )
                    .title("YouTube Music")
                    .inner_size(1024.0, 768.0)
                    .min_inner_size(325.0, 425.0)
                    .center()
                    .decorations(true)
                    .transparent(false)
                    .initialization_script(&init_script);

                    if let Some(icon) = app.default_window_icon() {
                        builder = builder.icon(icon.clone())?;
                    }

                    builder.build()?
                }
            };

            window::configure_window(&window, &initial_config);
            let _ = window.show();
            let _ = window.set_focus();

            if std::env::var("PEAR_DEBUG").map(|v| v == "1").unwrap_or(false) {
                window.open_devtools();
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
            commands::window_unmaximize,
            commands::window_minimize,
            commands::window_is_maximized,
            commands::window_set_always_on_top,
            commands::window_show,
            commands::window_hide,
            commands::window_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running pear desktop application");
}
