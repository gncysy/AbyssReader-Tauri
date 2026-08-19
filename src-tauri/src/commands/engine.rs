use crate::error::Result;
use serde_json::Value;
use std::collections::HashMap;
use tauri::Manager;

#[tauri::command]
pub async fn store_get(key: String) -> Result<Option<String>> {
    crate::storage::store_get(&key)
}

#[tauri::command]
pub async fn store_set(key: String, value: String) -> Result<()> {
    crate::storage::store_set(&key, &value)
}

#[tauri::command]
pub async fn store_delete(key: String) -> Result<()> {
    crate::storage::store_delete(&key)
}

#[tauri::command]
pub async fn store_get_all() -> Result<HashMap<String, Value>> {
    let rows = crate::storage::store_get_all()?;
    let mut map = HashMap::new();
    for (key, value) in rows {
        if let Ok(parsed) = serde_json::from_str::<Value>(&value) {
            map.insert(key, parsed);
        } else {
            map.insert(key, Value::String(value));
        }
    }
    Ok(map)
}

#[tauri::command]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .show()
            .map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_hostname() -> String {
    hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "desktop".into())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<()> {
    if url.is_empty() {
        return Err(crate::error::AbyssError::ConfigError("URL 为空".into()));
    }
    open::that(&url).map_err(|e| crate::error::AbyssError::IoError(e.to_string()))
}
