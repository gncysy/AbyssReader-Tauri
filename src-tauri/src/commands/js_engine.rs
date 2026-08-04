use crate::error::Result;
use crate::js_runtime::runtime;
use crate::network::http::execute_http_request;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JsExecutionResponse {
    pub success: bool,
    pub result: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn execute_js_rule(
    code: String,
    context: serde_json::Value,
    timeout_ms: Option<u64>,
) -> Result<JsExecutionResponse> {
    let code = preprocess_code(&code);
    let mut context = context;
    let _ = timeout_ms;

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
        Ok(result) => Ok(JsExecutionResponse { success: true, result, error: None }),
        Err(e) => Ok(JsExecutionResponse { success: false, result: String::new(), error: Some(e) }),
    }
}

fn preprocess_code(code: &str) -> String {
    let trimmed = code.trim_start();
    let without_prefix = trimmed
        .strip_prefix("@js:")
        .or_else(|| trimmed.strip_prefix("<js>"))
        .unwrap_or(trimmed);
    without_prefix
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(without_prefix)
        .trim()
        .to_string()
}

fn extract_js_from_show_rule(show_rule: &str) -> Option<String> {
    if let Some(js_start) = show_rule.find("@js:") {
        let after = &show_rule[js_start + 4..];
        let trimmed = after.trim_start();
        if let Some(js_end) = trimmed.find("</js>") {
            return Some(trimmed[..js_end].trim().to_string());
        }
        return Some(trimmed.to_string());
    }
    if let Some(js_start) = show_rule.find("<js>") {
        let after = &show_rule[js_start + 4..];
        if let Some(js_end) = after.find("</js>") {
            return Some(after[..js_end].trim().to_string());
        }
        return Some(after.trim().to_string());
    }
    None
}

fn parse_url_and_options(raw: &str) -> (String, String, std::collections::HashMap<String, String>, Option<String>) {
    if let Some(pos) = raw.find(",{") {
        let url = raw[..pos].to_string();
        let rest = &raw[pos+1..];
        let fixed = rest.replace('\'', "\"");
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&fixed) {
            let method = parsed.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_uppercase();
            let mut headers = std::collections::HashMap::new();
            if let Some(h) = parsed.get("headers") {
                if let Some(obj) = h.as_object() {
                    for (k, v) in obj {
                        headers.insert(k.clone(), v.as_str().unwrap_or("").to_string());
                    }
                }
            }
            let body = parsed.get("body").and_then(|v| {
                if v.is_string() { Some(v.as_str().unwrap().to_string()) } else { Some(v.to_string()) }
            });
            return (url, method, headers, body);
        }
        (raw.to_string(), "GET".into(), std::collections::HashMap::new(), None)
    } else {
        (raw.to_string(), "GET".into(), std::collections::HashMap::new(), None)
    }
}
fn parse_data_url(data_url: &str) -> Option<String> {
    if data_url.starts_with("data:;base64,") {
        let after_prefix = &data_url["data:;base64,".len()..];
        if let Some(comma_pos) = after_prefix.find(',') {
            let base64_part = &after_prefix[..comma_pos];
            use base64::Engine;
            match base64::engine::general_purpose::STANDARD.decode(base64_part) {
                Ok(bytes) => { let decoded = String::from_utf8_lossy(&bytes).to_string(); Some(decoded) }
                Err(_) => None,
            }
        } else {
            use base64::Engine;
            match base64::engine::general_purpose::STANDARD.decode(after_prefix) {
                Ok(bytes) => { let decoded = String::from_utf8_lossy(&bytes).to_string(); Some(decoded) }
                Err(_) => None,
            }
        }
    } else if data_url.starts_with("data:") {
        if let Some(base64_start) = data_url.find(";base64,") {
            let base64_part = &data_url[base64_start + 8..];
            use base64::Engine;
            match base64::engine::general_purpose::STANDARD.decode(base64_part) {
                Ok(bytes) => { let decoded = String::from_utf8_lossy(&bytes).to_string(); Some(decoded) }
                Err(_) => None,
            }
        } else {
            data_url.find(',').map(|p| data_url[p + 1..].to_string())
        }
    } else {
        None
    }
}

#[tauri::command]
pub async fn dict_query(
    url_rule: String,
    show_rule: String,
    key: String,
    timeout_secs: Option<u64>,
) -> Result<JsExecutionResponse> {
    let timeout = timeout_secs.unwrap_or(20);

    let url_result = if url_rule.starts_with("@js:") || url_rule.starts_with("<js>") {
        let js_code = preprocess_code(&url_rule);
        let ctx = serde_json::to_string(&serde_json::json!({ "result": "", "key": key, "baseUrl": "", "source": {}, "book": {} })).unwrap_or_default();
        match runtime::execute(&js_code, &ctx) {
            Ok(result) => result.trim().to_string(),
            Err(e) => return Ok(JsExecutionResponse { success: false, result: String::new(), error: Some(format!("urlRule 执行失败: {}", e)) }),
        }
    } else {
        let mut u = url_rule.replace("{{key}}", &urlencoding::encode(&key));
        u = u.replace("{{page}}", "1");
        u
    };

    if url_result.is_empty() || url_result == "undefined" || url_result == "null" {
        return Ok(JsExecutionResponse { success: false, result: String::new(), error: Some("urlRule 返回空".into()) });
    }

    let html = if url_result.starts_with("data:") {
        parse_data_url(&url_result).unwrap_or_default()
    } else if url_result.starts_with("http://") || url_result.starts_with("https://") {
        let (req_url, req_method, req_headers, req_body) = parse_url_and_options(&url_result);
        match execute_http_request(&req_url, &req_method, Some(req_headers), req_body, None, timeout).await {
            Ok(body) => body,
            Err(e) => return Ok(JsExecutionResponse { success: false, result: String::new(), error: Some(format!("HTTP 请求失败: {}", e)) }),
        }
    } else {
        url_result.clone()
    };

    if html.is_empty() {
        return Ok(JsExecutionResponse { success: false, result: String::new(), error: Some("HTML 为空".into()) });
    }

    let has_js = show_rule.contains("@js:") || show_rule.contains("<js>");
    if has_js {
        if let Some(js_code) = extract_js_from_show_rule(&show_rule) {
            let ctx = serde_json::to_string(&serde_json::json!({ "result": html, "key": key, "baseUrl": url_result, "source": {}, "book": {} })).unwrap_or_default();
            match runtime::execute(&js_code, &ctx) {
                Ok(result) => return Ok(JsExecutionResponse { success: true, result, error: None }),
                Err(e) => return Ok(JsExecutionResponse { success: false, result: String::new(), error: Some(format!("showRule JS 执行失败: {}", e)) }),
            }
        }
    }

    use scraper::{Html, Selector};
    let doc = Html::parse_document(&html);
    let parts: Vec<&str> = show_rule.split('@').collect();
    let css = if parts.len() > 1 { parts[0].replace("tag.", "").replace("class.", ".") } else { show_rule.replace("tag.", "").replace("class.", ".") };
    let attr = if parts.len() > 1 { parts[1].trim() } else { "html" };

    if css.is_empty() || css == "body" {
        if attr == "html" || attr == "all" || attr == "outerHTML" {
            Ok(JsExecutionResponse { success: true, result: html, error: None })
        } else {
            let text = doc.root_element().text().collect::<Vec<_>>().join("\n");
            Ok(JsExecutionResponse { success: true, result: text, error: None })
        }
    } else {
        match Selector::parse(&css) {
            Ok(sel) => {
                let results: Vec<String> = doc.select(&sel).map(|el| {
                    match attr {
                        "html" | "all" | "outerHTML" => el.html(),
                        "text" => el.text().collect::<Vec<_>>().join("\n"),
                        "innerHTML" => el.inner_html(),
                        _ => el.value().attr(attr).unwrap_or("").to_string(),
                    }
                }).collect();
                Ok(JsExecutionResponse { success: true, result: results.join("\n"), error: None })
            },
            Err(e) => Ok(JsExecutionResponse { success: false, result: String::new(), error: Some(format!("CSS 选择器无效: {}", e)) }),
        }
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
    let code = format!("{}\n{}\n{}\n{}", js_lib, login_url, login_ui, action);
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


