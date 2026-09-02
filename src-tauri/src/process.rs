use tauri::AppHandle;

pub fn relaunch(app: &AppHandle) {
    app.restart();
}

pub fn exit(app: &AppHandle, code: i32) {
    app.exit(code);
}
