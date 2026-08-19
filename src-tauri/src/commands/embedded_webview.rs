use crate::error::Result;
use tauri::Manager;

#[tauri::command]
pub async fn embedded_webview_action(
    _app: tauri::AppHandle,
    label: String,
    action: String,
    data: String,
) -> Result<String> {
    let window = match crate::js_runtime::ops::get_main_window() {
        Some(w) => w,
        None => return Err(crate::error::AbyssError::WebViewError("主窗口未初始化".into())),
    };

    match window.get_webview(&label) {
        Some(webview) => {
            match action.as_str() {
                "navigate" => {
                    let url = url::Url::parse(&data)
                        .map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 URL: {}", e)))?;
                    webview.navigate(url)
                        .map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
                    return Ok(format!("ok: {}", action));
                }
                "eval" => {
                    webview.eval(&data)
                        .map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
                    return Ok(format!("ok: {}", action));
                }
                "get_url" => {
                    let url = webview.url()
                        .map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
                    return Ok(url.to_string());
                }
                "close" => {
                    webview.close()
                        .map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
                    return Ok(format!("ok: {}", action));
                }
                _ => {
                    return Err(crate::error::AbyssError::ConfigError(
                        format!("未知 action: {}，支持 navigate/eval/get_url/close", action)
                    ));
                }
            }
        }
        None => {
            return Err(crate::error::AbyssError::WebViewError(
                format!("Webview 未找到: {}", label)
            ));
        }
    }
}
