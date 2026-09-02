use tauri::{PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow};
use serde_json::Value;

pub fn configure_window(window: &WebviewWindow, config: &Value) {
    let _ = window.set_min_size(Some(Size::Physical(PhysicalSize {
        width: 325,
        height: 425,
    })));

    if let Some(size) = config.get("window-size") {
        if let (Some(w), Some(h)) = (size.get("width").and_then(Value::as_u64), size.get("height").and_then(Value::as_u64)) {
            let _ = window.set_size(Size::Physical(PhysicalSize {
                width: w as u32,
                height: h as u32,
            }));
        }
    }

    if let Some(pos) = config.get("window-position") {
        if let (Some(x), Some(y)) = (pos.get("x").and_then(Value::as_i64), pos.get("y").and_then(Value::as_i64)) {
            let _ = window.set_position(Position::Physical(PhysicalPosition {
                x: x as i32,
                y: y as i32,
            }));
        }
    }

    if let Some(maximized) = config.get("window-maximized").and_then(Value::as_bool) {
        if maximized {
            let _ = window.maximize();
        }
    }

    if let Some(options) = config.get("options") {
        if let Some(always_on_top) = options.get("alwaysOnTop").and_then(Value::as_bool) {
            let _ = window.set_always_on_top(always_on_top);
        }
        if let Some(app_visible) = options.get("appVisible").and_then(Value::as_bool) {
            if app_visible {
                let _ = window.show();
            }
        } else {
            let _ = window.show();
        }
    } else {
        let _ = window.show();
    }
}
