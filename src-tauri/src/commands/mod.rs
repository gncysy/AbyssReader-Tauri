pub mod bookshelf;
pub mod cache;
pub mod comic;
pub mod engine;
pub mod fetch;
pub mod webview;
pub mod rss;
pub mod js_engine;
pub mod login;
pub mod local_book;
pub mod source;
pub mod embedded_webview;

pub use bookshelf::*;
pub use cache::*;
pub use comic::*;
pub use engine::*;
pub use fetch::*;
pub use webview::*;
pub use rss::*;
pub use local_book::*;
pub use source::*;
pub use embedded_webview::*;

pub use js_engine::*;

#[tauri::command]
pub async fn cleanup_webviews() -> crate::error::Result<()> {
    crate::js_runtime::ops::close_persistent_webview();
    crate::js_runtime::ops::cleanup_all_embedded_webviews();
    Ok(())
}

#[tauri::command]
pub async fn source_login(source: serde_json::Value) -> crate::error::Result<crate::commands::JsExecutionResponse> {
    login::source_login(source).await
}

#[tauri::command]
pub async fn source_login_ui(source: serde_json::Value) -> crate::error::Result<crate::commands::JsExecutionResponse> {
    login::source_login_ui(source).await
}

#[tauri::command]
pub async fn source_login_action(source: serde_json::Value, action: String) -> crate::error::Result<crate::commands::JsExecutionResponse> {
    login::source_login_action(source, action).await
}

// ─── 验证码提交/取消（转发到 ops 层） ───

#[tauri::command]
pub fn submit_verification_code(code: String) -> String {
    crate::js_runtime::ops::set_pending_verification(code);
    "ok".to_string()
}

#[tauri::command]
pub fn cancel_verification_code() -> String {
    crate::js_runtime::ops::set_pending_verification(String::new());
    "ok".to_string()
}
