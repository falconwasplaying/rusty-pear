use tauri::{AppHandle, Emitter, PhysicalPosition, PhysicalSize, Position, Size, State, WebviewWindow};
use serde_json::{json, Value};
use crate::state::AppState;
use crate::config::{get_value_by_key_path, save_config_atomic, set_value_by_key_path};

#[tauri::command]
pub fn get_config(state: State<'_, AppState>, key: Option<String>) -> Value {
    let conf = state.config.lock().unwrap();
    if let Some(k) = key {
        get_value_by_key_path(&conf, &k).cloned().unwrap_or(Value::Null)
    } else {
        conf.clone()
    }
}

#[tauri::command]
pub fn set_config(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
    value: Value,
) -> Result<(), String> {
    let mut conf = state.config.lock().unwrap();
    set_value_by_key_path(&mut conf, &key, value.clone());
    save_config_atomic(&app, &conf)?;
    let _ = app.emit("config-changed", json!({ "key": key, "value": value }));
    Ok(())
}

#[tauri::command]
pub fn window_set_size(window: WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    window
        .set_size(Size::Physical(PhysicalSize { width, height }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_position(window: WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    window
        .set_position(Position::Physical(PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_maximize(window: WebviewWindow) -> Result<(), String> {
    window.maximize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_is_maximized(window: WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_always_on_top(window: WebviewWindow, always_on_top: bool) -> Result<(), String> {
    window.set_always_on_top(always_on_top).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_show(window: WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_hide(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}
