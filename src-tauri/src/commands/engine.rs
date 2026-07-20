use crate::error::Result;
use crate::network::http::execute_http_request;
use serde_json::Value;
use std::collections::HashMap;

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

fn extract_headers(source: &Value) -> Option<HashMap<String, String>> {
    let header_str = source.get("header").and_then(|v| v.as_str())?;
    // 书源的 header 可能包含 @js: / <js> 代码，需要执行后才得到 JSON
    // 简化处理：如果包含 <js> 或 @js:，尝试提取 User-Agent 作为 fallback
    let json_str = if header_str.contains("<js>") || header_str.contains("@js:") {
        // 尝试从 @js: 代码中提取关键 header
        if let Some(ua) = extract_ua_from_js_header(header_str) {
            return Some(HashMap::from([("User-Agent".to_string(), ua)]));
        }
        // 回退：用默认 UA
        return Some(HashMap::from([("User-Agent".to_string(), "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36".to_string())]));
    } else {
        header_str.replace('\'', "\"").replace('\n', "").replace('\r', "")
    };
    serde_json::from_str::<HashMap<String, String>>(&json_str).ok()
}

fn extract_ua_from_js_header(js: &str) -> Option<String> {
    // 从 JS 代码里提取 User-Agent 字符串
    for line in js.lines() {
        let trimmed = line.trim();
        if trimmed.contains("User-Agent") || trimmed.contains("user-agent") || trimmed.contains("useragent") {
            if let Some(start) = trimmed.find('"') {
                if let Some(end) = trimmed[start+1..].find('"') {
                    return Some(trimmed[start+1..start+1+end].to_string());
                }
            }
        }
    }
    None
}

fn resolve_url(url: &str, base_url: &str) -> String {
    if url.starts_with("http") { return url.to_string() }
    format!("{}/{}", base_url.trim_end_matches('/'), url.trim_start_matches('/'))
}

#[tauri::command]
pub async fn engine_search(source: Value, keyword: String, page: i32) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let search_url = source.get("searchUrl").and_then(|v| v.as_str()).unwrap_or("");
    let mut url = search_url.replace("{{key}}", &urlencoding::encode(&keyword)).replace("{{page}}", &page.to_string());
    if !url.starts_with("http") { url = resolve_url(&url, base_url); }
    let headers = extract_headers(&source);
    let html = execute_http_request(&url, "GET", headers, None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "keyword": keyword, "page": page } }))
}

#[tauri::command]
pub async fn engine_batch_search(sources: Vec<Value>, keyword: String, page: i32) -> Result<Value> {
    let mut results = serde_json::Map::new();
    for source in &sources {
        let name = source.get("bookSourceName").or_else(|| source.get("name")).and_then(|v| v.as_str()).unwrap_or("unknown");
        match engine_search(source.clone(), keyword.clone(), page).await {
            Ok(result) => { results.insert(name.to_string(), result); }
            Err(e) => { results.insert(name.to_string(), serde_json::json!({ "success": false, "error": e.to_string() })); }
        }
    }
    Ok(serde_json::json!({ "success": true, "data": Value::Object(results), "searchId": format!("search_{}", chrono::Utc::now().timestamp_millis()) }))
}

#[tauri::command]
pub async fn engine_get_toc(source: Value, toc_url: String, book: Option<Value>) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let url = resolve_url(&toc_url, base_url);
    let headers = extract_headers(&source);
    let html = execute_http_request(&url, "GET", headers, None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "tocUrl": url, "book": book } }))
}

#[tauri::command]
pub async fn engine_get_content(source: Value, chapter_url: String, book_kind: Option<String>) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let url = resolve_url(&chapter_url, base_url);
    let headers = extract_headers(&source);
    let html = execute_http_request(&url, "GET", headers, None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "chapterUrl": url, "bookKind": book_kind } }))
}

#[tauri::command]
pub async fn engine_get_book_info(source: Value, book_url: String) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let url = resolve_url(&book_url, base_url);
    let headers = extract_headers(&source);
    let html = execute_http_request(&url, "GET", headers, None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "bookUrl": url } }))
}

#[tauri::command]
pub async fn engine_get_explore_books(source: Value, category_url: String, page: i32) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let mut url = category_url.replace("{{page}}", &page.to_string());
    if !url.starts_with("http") { url = resolve_url(&url, base_url); }
    let headers = extract_headers(&source);
    let html = execute_http_request(&url, "GET", headers, None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "categoryUrl": url, "page": page } }))
}

#[tauri::command]
pub async fn engine_parse_rule(source: Value, rule: String, data: Value, context: Option<Value>) -> Result<Value> {
    Ok(serde_json::json!({ "success": true, "data": data, "rule": rule, "source": source, "context": context }))
}
