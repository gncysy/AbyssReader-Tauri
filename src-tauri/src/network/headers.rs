use std::collections::HashMap;
use serde_json::Value;

pub fn build_headers(source: &Value, include_x_requested: bool) -> Vec<(String, String)> {
    let mut headers = Vec::new();
    let book_source_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");

    if let Some(header_str) = source.get("header").and_then(|v| v.as_str()) {
        let trimmed = header_str.trim();
        if trimmed.starts_with("@js:") || trimmed.starts_with("<js>") {
            if let Some(parsed) = evaluate_js_header(trimmed, book_source_url) {
                for (k, v) in parsed {
                    if !include_x_requested && k.eq_ignore_ascii_case("x-requested-with") {
                        continue;
                    }
                    headers.push((k, v));
                }
            }
        } else {
            // 直接解析标准 JSON，不做单引号替换
            if let Ok(h) = serde_json::from_str::<HashMap<String, String>>(trimmed) {
                for (k, v) in h {
                    if !include_x_requested && k.eq_ignore_ascii_case("x-requested-with") {
                        continue;
                    }
                    headers.push((k, v));
                }
            }
        }
    }

    if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("User-Agent")) {
        headers.push((
            "User-Agent".into(),
            "Mozilla/5.0 (Linux; Android 13; zh-cn; V2304A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.231 Mobile Safari/537.36".into(),
        ));
    }
    if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("Referer")) {
        if !book_source_url.is_empty() {
            headers.push(("Referer".into(), book_source_url.to_string()));
        }
    }
    if !headers.iter().any(|(k, _)| k.eq_ignore_ascii_case("Accept")) {
        headers.push((
            "Accept".into(),
            "image/avif,image/webp,image/apng,image/*,*/*;q=0.8".into(),
        ));
    }
    headers
}

pub fn evaluate_js_header(header_str: &str, book_source_url: &str) -> Option<Vec<(String, String)>> {
    use crate::js_runtime::runtime;

    let code = header_str
        .trim()
        .strip_prefix("@js:")
        .or_else(|| header_str.trim().strip_prefix("<js>"))
        .unwrap_or(header_str)
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(header_str)
        .trim()
        .to_string();

    // 使用 JSON 序列化安全传递字符串，避免手动转义
    let base_url_json = serde_json::to_string(book_source_url).unwrap_or_else(|_| "\"\"".into());
    let source_url_json = serde_json::to_string(book_source_url).unwrap_or_else(|_| "\"\"".into());

    let wrapped = format!(
        "var baseUrl = {}; var result = ''; var source = {{ bookSourceUrl: {} }}; {}",
        base_url_json, source_url_json, code
    );

    match runtime::execute(&wrapped, "{}") {
        Ok(result) => {
            let trimmed = result.trim();
            if trimmed.is_empty() {
                return None;
            }
            // 先尝试标准 JSON
            if let Ok(h) = serde_json::from_str::<HashMap<String, String>>(trimmed) {
                return Some(h.into_iter().collect());
            }
            None
        }
        Err(_) => None,
    }
}
