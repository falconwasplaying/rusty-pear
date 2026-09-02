use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, Submenu},
    AppHandle, Manager,
};

pub fn setup_menu(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // 1. File Submenu
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, "file_restart", "Restart", true, Some("Ctrl+R"))?,
            &MenuItem::with_id(app, "file_quit", "Quit", true, Some("Ctrl+Q"))?,
        ],
    )?;

    // 2. Options Submenu
    let options_menu = Submenu::with_items(
        app,
        "Options",
        true,
        &[
            &CheckMenuItem::with_id(app, "opt_always_on_top", "Always on Top", true, false, None::<&str>)?,
            &CheckMenuItem::with_id(app, "opt_resume_on_start", "Resume on Start", true, true, None::<&str>)?,
            &CheckMenuItem::with_id(app, "opt_auto_cache", "Auto Reset App Cache", true, false, None::<&str>)?,
        ],
    )?;

    // 3. View Submenu
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(app, "view_reload", "Reload", true, Some("F5"))?,
            &MenuItem::with_id(app, "view_force_reload", "Force Reload", true, Some("Ctrl+F5"))?,
            &MenuItem::with_id(app, "view_fullscreen", "Toggle Fullscreen", true, Some("F11"))?,
        ],
    )?;

    // 4. Navigation Submenu
    let nav_menu = Submenu::with_items(
        app,
        "Navigation",
        true,
        &[
            &MenuItem::with_id(app, "nav_back", "Back", true, Some("Alt+Left"))?,
            &MenuItem::with_id(app, "nav_forward", "Forward", true, Some("Alt+Right"))?,
        ],
    )?;

    // 5. Plugins Submenu
    let plugin_names = [
        ("plugin_in_app_menu", "In-App Menu", true),
        ("plugin_visualizer", "Visualizer", false),
        ("plugin_synced_lyrics", "Synced Lyrics", false),
        ("plugin_equalizer", "Equalizer", false),
        ("plugin_sponsorblock", "SponsorBlock", false),
        ("plugin_skip_silences", "Skip Silences", false),
        ("plugin_precise_volume", "Precise Volume", false),
        ("plugin_notifications", "Notifications", true),
        ("plugin_discord", "Discord Rich Presence", false),
        ("plugin_downloader", "Downloader", false),
        ("plugin_ambient_mode", "Ambient Mode", false),
        ("plugin_picture_in_picture", "Picture in Picture", false),
        ("plugin_playback_speed", "Playback Speed", false),
        ("plugin_quality_changer", "Quality Changer", false),
        ("plugin_scrobbler", "Scrobbler", false),
        ("plugin_album_actions", "Album Actions", false),
        ("plugin_album_color_theme", "Album Color Theme", false),
        ("plugin_blur_nav_bar", "Blur Navigation Bar", false),
        ("plugin_custom_output_device", "Custom Output Device", false),
        ("plugin_disable_autoplay", "Disable Autoplay", false),
    ];

    let mut plugin_items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    for (id, label, default_checked) in plugin_names {
        let item = CheckMenuItem::with_id(app, id, label, true, default_checked, None::<&str>)?;
        plugin_items.push(Box::new(item));
    }

    let plugin_item_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        plugin_items.iter().map(|b| b.as_ref()).collect();

    let plugins_menu = Submenu::with_items(app, "Plugins", true, &plugin_item_refs)?;

    let _menu = Menu::with_items(
        app,
        &[&file_menu, &options_menu, &view_menu, &nav_menu, &plugins_menu],
    )?;

    // On Windows/Linux, attaching a native HMENU to the window draws the classic
    // Windows 7 / 95 style gray menu bar. Pear uses the in-app HTML TitleBar instead.
    #[cfg(target_os = "macos")]
    app.set_menu(_menu)?;

    app.on_menu_event(|app, event| {
        let id_str = event.id.as_ref();
        match id_str {
            "file_restart" => {
                app.restart();
            }
            "file_quit" => {
                app.exit(0);
            }
            "view_reload" | "view_force_reload" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.eval("window.location.reload()");
                }
            }
            "view_fullscreen" => {
                if let Some(win) = app.get_webview_window("main") {
                    if let Ok(is_full) = win.is_fullscreen() {
                        let _ = win.set_fullscreen(!is_full);
                    }
                }
            }
            "nav_back" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.eval("window.history.back()");
                }
            }
            "nav_forward" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.eval("window.history.forward()");
                }
            }
            "opt_always_on_top" => {
                if let Some(win) = app.get_webview_window("main") {
                    // Toggle always on top
                    let _ = win.set_always_on_top(true);
                }
            }
            id if id.starts_with("plugin_") => {
                let plugin_id = id.trim_start_matches("plugin_").replace('_', "-");
                if let Some(win) = app.get_webview_window("main") {
                    let js = format!(
                        "if (window.pear && window.pear.config) {{ \
                            window.pear.config.get('plugins.{}').then(function(c) {{ \
                                var enabled = !(c && c.enabled); \
                                window.pear.config.patch('plugins.{}', {{ enabled: enabled }}); \
                            }}); \
                        }}",
                        plugin_id, plugin_id
                    );
                    let _ = win.eval(&js);
                }
            }
            _ => {}
        }
    });

    Ok(())
}
