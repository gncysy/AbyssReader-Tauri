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
    let context_json = serde_json::to_string(&request.context).unwrap_or_else(|_| "{}".into());

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

fn preprocess_code(code: &str) -> String {
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
