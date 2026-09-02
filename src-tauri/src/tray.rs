use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let play_pause_i = MenuItem::with_id(app, "play_pause", "Play/Pause", true, None::<&str>)?;
    let next_i = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
    let prev_i = MenuItem::with_id(app, "prev", "Previous", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&play_pause_i, &next_i, &prev_i, &quit_i])?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "play_pause" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("peard:toggle-play", ());
                }
            }
            "next" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("peard:next-video", ());
                }
            }
            "prev" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.emit("peard:previous-video", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(is_visible) = window.is_visible() {
                        if is_visible {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
