use crate::error::Result;
use crate::js_runtime::runtime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JsExecutionRequest {
    pub code: String,
    pub context: serde_json::Value,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JsExecutionResponse {
    pub success: bool,
    pub result: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn execute_js_rule(request: JsExecutionRequest) -> Result<JsExecutionResponse> {
    let code = preprocess_code(&request.code);
    let mut context = request.context.clone();

    let ua = crate::storage::store_get("userAgent").unwrap_or_default();
    let ua = if let Some(ref u) = ua {
        if u.is_empty() {
            "Mozilla/5.0 (Linux; Android 13; zh-cn; V2304A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.231 Mobile Safari/537.36"
        } else {
            u.as_str()
        }
    } else {
        "Mozilla/5.0 (Linux; Android 13; zh-cn; V2304A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.231 Mobile Safari/537.36"
    };
    crate::js_runtime::ops::set_global_ua(ua.to_string());

    if let Some(obj) = context.as_object_mut() {
        obj.insert("userAgent".into(), serde_json::Value::String(ua.to_string()));
    }

    let context_json = serde_json::to_string(&context).unwrap_or_else(|_| "{}".into());

    match runtime::execute(&code, &context_json) {
        Ok(result) => Ok(JsExecutionResponse {
            success: true,
            result,
            error: None,
        }),
        Err(e) => Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some(e),
        }),
    }
}


#[tauri::command]
pub async fn source_login(source: serde_json::Value) -> Result<JsExecutionResponse> {
    let login_url = source.get("loginUrl").and_then(|v| v.as_str()).unwrap_or("");
    if login_url.is_empty() {
        return Ok(JsExecutionResponse { success: false, result: String::new(), error: Some("书源未配置 loginUrl".into()) });
    }
    
    let code = preprocess_code(login_url);
    let context = serde_json::json!({
        "source": source,
        "result": "",
        "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or(""),
    });
    let context_json = serde_json::to_string(&context).unwrap_or_else(|_| "{}".into());
    
    match runtime::execute(&code, &context_json) {
        Ok(result) => Ok(JsExecutionResponse { success: true, result, error: None }),
        Err(e) => Ok(JsExecutionResponse { success: false, result: String::new(), error: Some(e) }),
    }
}
#[tauri::command]
pub async fn source_login_ui(source: serde_json::Value) -> Result<JsExecutionResponse> {
    let login_ui = source.get("loginUi").and_then(|v| v.as_str()).unwrap_or("");
    if login_ui.is_empty() {
        return Ok(JsExecutionResponse { success: false, result: "[]".into(), error: Some("书源未配置 loginUi".into()) });
    }
    let code = preprocess_code(login_ui);
    let context = serde_json::json!({
        "source": source,
        "book": {},
        "chapter": null,
        "result": "",
        "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or(""),
    });
    let context_json = serde_json::to_string(&context).unwrap_or_else(|_| "{}".into());
    match runtime::execute(&code, &context_json) {
        Ok(result) => Ok(JsExecutionResponse { success: true, result, error: None }),
        Err(e) => Ok(JsExecutionResponse { success: false, result: String::new(), error: Some(e) }),
    }
}

#[tauri::command]
pub async fn source_login_action(source: serde_json::Value, action: String) -> Result<JsExecutionResponse> {
    let login_url = source.get("loginUrl").and_then(|v| v.as_str()).unwrap_or("");
    let js_lib = source.get("jsLib").and_then(|v| v.as_str()).unwrap_or("{}");
    let login_ui = source.get("loginUi").and_then(|v| v.as_str()).unwrap_or("");
    
    // 把 loginUrl、jsLib、loginUi 和 action 拼成完整 JS 执行
    let code = format!(
        "{}\n{}\n{}\n{}",
        js_lib,
        login_url,
        login_ui,
        action
    );
    let context = serde_json::json!({
        "source": source,
        "result": "",
        "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or(""),
    });
    let context_json = serde_json::to_string(&context).unwrap_or_else(|_| "{}".into());
    match runtime::execute(&code, &context_json) {
        Ok(result) => Ok(JsExecutionResponse { success: true, result, error: None }),
        Err(e) => Ok(JsExecutionResponse { success: false, result: String::new(), error: Some(e) }),
    }
}fn preprocess_code(code: &str) -> String {
    code.trim_start()
        .strip_prefix("@js:")
        .unwrap_or(code)
        .trim_start()
        .strip_prefix("<js>")
        .and_then(|s| s.strip_suffix("</js>"))
        .unwrap_or(code)
        .trim()
        .to_string()
}
