use crate::error::Result;
use crate::network::http::execute_http_request;
use serde_json::Value;
use std::collections::HashMap;
use tauri::Manager;

#[tauri::command] pub async fn store_get(key: String) -> Result<Option<String>> { crate::storage::store_get(&key) }
#[tauri::command] pub async fn store_set(key: String, value: String) -> Result<()> { crate::storage::store_set(&key, &value) }
#[tauri::command] pub async fn store_delete(key: String) -> Result<()> { crate::storage::store_delete(&key) }
#[tauri::command] pub async fn store_get_all() -> Result<HashMap<String, Value>> {
    let rows = crate::storage::store_get_all()?;
    let mut map = HashMap::new();
    for (key, value) in rows {
        if let Ok(parsed) = serde_json::from_str::<Value>(&value) { map.insert(key, parsed); }
        else { map.insert(key, Value::String(value)); }
    }
    Ok(map)
}

fn extract_headers(source: &Value) -> Option<HashMap<String, String>> {
    let header_str = source.get("header").and_then(|v| v.as_str())?;
    let trimmed = header_str.trim();

    if trimmed.contains("<js>") || trimmed.contains("@js:") {
        return Some(HashMap::from([("User-Agent".to_string(), "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36".to_string())]));
    }

    let normalized = trimmed.replace('\'', "\"").replace('\n', "").replace('\r', "").replace('\t', " ");
    if let Ok(h) = serde_json::from_str::<HashMap<String, String>>(&normalized) {
        return Some(h);
    }

    if let Ok(h) = serde_json::from_str::<HashMap<String, String>>(trimmed) {
        return Some(h);
    }

    let mut map = HashMap::new();
    for line in trimmed.lines() {
        let l = line.trim().trim_matches(',').trim().replace('\'', "\"");
        if let Some(colon) = l.find(':') {
            let key = l[..colon].trim().trim_matches('"').to_string();
            let value = l[colon+1..].trim().trim_matches('"').to_string();
            if !key.is_empty() && !value.is_empty() {
                map.insert(key, value);
            }
        }
    }

    if map.is_empty() {
        map.insert("User-Agent".to_string(), "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36".to_string());
    }
    Some(map)
}

fn resolve_url(url: &str, base_url: &str) -> String {
    if url.starts_with("http") { return url.to_string() }
    format!("{}/{}", base_url.trim_end_matches('/'), url.trim_start_matches('/'))
}

#[tauri::command] pub async fn engine_search(source: Value, keyword: String, page: i32) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let search_url = source.get("searchUrl").and_then(|v| v.as_str()).unwrap_or("");
    let mut url = search_url.replace("{{key}}", &urlencoding::encode(&keyword)).replace("{{page}}", &page.to_string());
    if !url.starts_with("http") { url = resolve_url(&url, base_url); }
    let html = execute_http_request(&url, "GET", extract_headers(&source), None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "keyword": keyword, "page": page } }))
}

#[tauri::command] pub async fn engine_batch_search(sources: Vec<Value>, keyword: String, page: i32) -> Result<Value> {
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

#[tauri::command] pub async fn engine_get_toc(source: Value, toc_url: String, book: Option<Value>) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let url = resolve_url(&toc_url, base_url);
    let html = execute_http_request(&url, "GET", extract_headers(&source), None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "tocUrl": url, "book": book } }))
}

#[tauri::command] pub async fn engine_get_content(source: Value, chapter_url: String, book_kind: Option<String>) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let url = resolve_url(&chapter_url, base_url);
    let html = execute_http_request(&url, "GET", extract_headers(&source), None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "chapterUrl": url, "bookKind": book_kind } }))
}

#[tauri::command] pub async fn engine_get_book_info(source: Value, book_url: String) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let url = resolve_url(&book_url, base_url);
    let html = execute_http_request(&url, "GET", extract_headers(&source), None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "bookUrl": url } }))
}

#[tauri::command] pub async fn engine_get_explore_books(source: Value, category_url: String, page: i32) -> Result<Value> {
    let base_url = source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("");
    let mut url = category_url.replace("{{page}}", &page.to_string());
    if !url.starts_with("http") { url = resolve_url(&url, base_url); }
    let html = execute_http_request(&url, "GET", extract_headers(&source), None, None, 30).await?;
    Ok(serde_json::json!({ "success": true, "data": { "html": html, "source": source, "categoryUrl": url, "page": page } }))
}

#[tauri::command] pub async fn engine_parse_rule(source: Value, rule: String, data: Value, context: Option<Value>) -> Result<Value> {
    Ok(serde_json::json!({ "success": true, "data": data, "rule": rule, "source": source, "context": context }))
}

#[tauri::command]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
    }
    Ok(())
}
