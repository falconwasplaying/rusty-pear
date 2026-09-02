use std::fs;
use std::path::PathBuf;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub fn get_config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn get_config_path(app: &AppHandle) -> PathBuf {
    get_config_dir(app).join("config.json")
}

pub fn load_initial_config(app: &AppHandle) -> Value {
    let path = get_config_path(app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                return val;
            }
        }
    }
    // Default fallback config
    json!({
        "url": "https://music.youtube.com",
        "window-size": {
            "width": 1024,
            "height": 768
        },
        "window-maximized": false,
        "options": {
            "appVisible": true,
            "alwaysOnTop": false,
            "hideMenu": false,
            "restartOnConfigChanges": false,
            "resumeOnStart": true,
            "language": "en"
        },
        "plugins": {}
    })
}

pub fn save_config_atomic(app: &AppHandle, config: &Value) -> Result<(), String> {
    let dir = get_config_dir(app);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let file_path = get_config_path(app);
    let tmp_path = dir.join("config.json.tmp");
    let serialized = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&tmp_path, serialized).map_err(|e| e.to_string())?;
    fs::rename(tmp_path, file_path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_value_by_key_path<'a>(root: &'a Value, path: &str) -> Option<&'a Value> {
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = root;
    for part in parts {
        match current {
            Value::Object(map) => {
                current = map.get(part)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

pub fn set_value_by_key_path(root: &mut Value, path: &str, new_val: Value) {
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = root;
    for (i, part) in parts.iter().enumerate() {
        if i == parts.len() - 1 {
            if let Value::Object(map) = current {
                map.insert((*part).to_string(), new_val);
            }
            return;
        }
        if !current.is_object() {
            *current = Value::Object(serde_json::Map::new());
        }
        let map = current.as_object_mut().unwrap();
        if !map.contains_key(*part) || !map[*part].is_object() {
            map.insert((*part).to_string(), Value::Object(serde_json::Map::new()));
        }
        current = map.get_mut(*part).unwrap();
    }
}
