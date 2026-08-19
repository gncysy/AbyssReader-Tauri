use crate::error::Result;
use crate::js_runtime::runtime;
use crate::commands::JsExecutionResponse;

pub async fn source_login(source: serde_json::Value) -> Result<JsExecutionResponse> {
    let login_url = source.get("loginUrl").and_then(|v| v.as_str()).unwrap_or("");
    if login_url.is_empty() {
        return Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some("书源未配置 loginUrl".into()),
        });
    }

    let code = login_url
        .trim_start()
        .strip_prefix("@js:")
        .or_else(|| login_url.trim_start().strip_prefix("<js>"))
        .unwrap_or(login_url)
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(login_url)
        .trim()
        .to_string();

    let context = serde_json::json!({
        "source": source,
        "result": "",
        "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("")
    });
    let context_json = serde_json::to_string(&context).unwrap_or_else(|_| "{}".into());

    match runtime::execute(&code, &context_json) {
        Ok(result) => {
            // 尝试解析结果中的 cookie
            let cookies = serde_json::from_str::<serde_json::Value>(&result)
                .ok()
                .and_then(|v| v.get("cookies").cloned());
            Ok(JsExecutionResponse {
                success: true,
                result: if cookies.is_some() { result } else { result },
                error: None,
            })
        }
        Err(e) => Ok(JsExecutionResponse {
            success: false,
            result: String::new(),
            error: Some(e),
        }),
    }
}

pub async fn source_login_ui(source: serde_json::Value) -> Result<JsExecutionResponse> {
    let login_ui = source.get("loginUi").and_then(|v| v.as_str()).unwrap_or("");
    if login_ui.is_empty() {
        return Ok(JsExecutionResponse {
            success: false,
            result: "[]".into(),
            error: Some("书源未配置 loginUi".into()),
        });
    }

    let code = login_ui
        .trim_start()
        .strip_prefix("@js:")
        .or_else(|| login_ui.trim_start().strip_prefix("<js>"))
        .unwrap_or(login_ui)
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(login_ui)
        .trim()
        .to_string();

    let context = serde_json::json!({
        "source": source,
        "book": {},
        "chapter": null,
        "result": "",
        "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("")
    });
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

pub async fn source_login_action(source: serde_json::Value, action: String) -> Result<JsExecutionResponse> {
    let js_lib = source.get("jsLib").and_then(|v| v.as_str()).unwrap_or("");
    let login_url = source.get("loginUrl").and_then(|v| v.as_str()).unwrap_or("");
    let login_ui = source.get("loginUi").and_then(|v| v.as_str()).unwrap_or("");

    // 分别执行，而不是简单拼接
    let mut all_results = Vec::new();

    if !js_lib.is_empty() {
        if let Ok(r) = runtime::execute(js_lib, "{}") {
            all_results.push(r);
        }
    }
    if !login_url.is_empty() && login_url.starts_with("@js:") {
        let code = login_url.replace("@js:", "").trim().to_string();
        let ctx = serde_json::json!({
            "source": source,
            "result": "",
            "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("")
        });
        if let Ok(r) = runtime::execute(&code, &serde_json::to_string(&ctx).unwrap_or_default()) {
            all_results.push(r);
        }
    }
    if !login_ui.is_empty() && login_ui.starts_with("@js:") {
        let code = login_ui.replace("@js:", "").trim().to_string();
        let ctx = serde_json::json!({
            "source": source,
            "result": "",
            "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("")
        });
        if let Ok(r) = runtime::execute(&code, &serde_json::to_string(&ctx).unwrap_or_default()) {
            all_results.push(r);
        }
    }

    // 执行 action
    let action_code = action
        .trim_start()
        .strip_prefix("@js:")
        .or_else(|| action.trim_start().strip_prefix("<js>"))
        .unwrap_or(&action)
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(&action)
        .trim()
        .to_string();

    let ctx = serde_json::json!({
        "source": source,
        "result": "",
        "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("")
    });

    match runtime::execute(&action_code, &serde_json::to_string(&ctx).unwrap_or_default()) {
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
