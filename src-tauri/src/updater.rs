use tauri::AppHandle;

pub async fn check_update(_app: AppHandle) -> Result<bool, String> {
    Ok(false)
}
