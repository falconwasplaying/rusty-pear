use tauri::{
    menu::{Menu, MenuItem, Submenu},
    AppHandle,
};

pub fn setup_menu(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, "restart", "Restart", true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
        ],
    )?;

    let menu = Menu::with_items(app, &[&file_menu])?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        match event.id.as_ref() {
            "restart" => {
                app.restart();
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        }
    });

    Ok(())
}
