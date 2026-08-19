use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;
use tauri::WebviewWindowBuilder;

const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const IDLE_TIMEOUT_SECS: u64 = 300;

static PERSISTENT_WEBVIEW: OnceLock<Arc<Mutex<Option<tauri::WebviewWindow>>>> = OnceLock::new();
static LAST_USED: OnceLock<Arc<Mutex<Instant>>> = OnceLock::new();

fn get_last_used_slot() -> Arc<Mutex<Instant>> {
    let slot = LAST_USED.get_or_init(|| Arc::new(Mutex::new(Instant::now())));
    slot.clone()
}

fn touch_last_used() {
    let slot = get_last_used_slot();
    let mut guard = slot.lock().unwrap();
    *guard = Instant::now();
}

pub fn cleanup_idle_webview() {
    let slot = get_last_used_slot();
    let last_used = {
        let guard = slot.lock().unwrap();
        *guard
    };
    if last_used.elapsed().as_secs() > IDLE_TIMEOUT_SECS {
        close_persistent_webview();
    }
}

pub fn get_persistent_slot() -> Arc<Mutex<Option<tauri::WebviewWindow>>> {
    let slot = PERSISTENT_WEBVIEW.get_or_init(|| Arc::new(Mutex::new(None)));
    slot.clone()
}

pub fn get_or_create_persistent_webview(
    app: &tauri::AppHandle,
    initial_url: tauri::WebviewUrl,
) -> Result<tauri::WebviewWindow, String> {
    let slot = get_persistent_slot();
    let mut guard = slot.lock().unwrap();
    if let Some(existing) = guard.as_ref() {
        touch_last_used();
        return Ok(existing.clone());
    }

    let label = format!("webview_persistent_{}", uuid::Uuid::new_v4());
    let window = WebviewWindowBuilder::new(app, &label, initial_url)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .title("")
        .user_agent(DEFAULT_UA)
        .build()
        .map_err(|e| e.to_string())?;

    crate::js_runtime::ops::emit_log("info", &format!("[webview-manager] 创建持久 WebView: {}", label));
    *guard = Some(window.clone());
    touch_last_used();
    Ok(window)
}

pub fn close_persistent_webview() {
    let slot = get_persistent_slot();
    let mut guard = slot.lock().unwrap();
    if let Some(window) = guard.take() {
        crate::js_runtime::ops::emit_log("info", "[webview-manager] 清理持久 WebView");
        let _ = window.close();
    }
}

pub fn navigate_persistent_webview(window: &tauri::WebviewWindow, url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
    window.navigate(parsed).map_err(|e| e.to_string())
}

pub fn eval_persistent_webview(window: &tauri::WebviewWindow, js: &str) -> Result<(), String> {
    window.eval(js).map_err(|e| e.to_string())
}
