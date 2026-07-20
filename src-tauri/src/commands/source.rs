use crate::error::Result;
use crate::network::http::execute_http_request;
use crate::storage;
use serde_json::Value;
use std::time::Instant;
use tauri::Emitter;

#[tauri::command]
pub async fn get_book_sources() -> Result<Value> {
    let sources = storage::load_book_sources()?;
    Ok(serde_json::Value::Array(sources))
}

#[tauri::command]
pub async fn add_book_source(source_json: String) -> Result<String> {
    let new_items = parse_sources_json(&source_json)?;
    if new_items.is_empty() {
        return Err(crate::error::AbyssError::ParseError("未找到有效的书源数据".into()));
    }
    let mut existing = storage::load_book_sources()?;
    let mut added = 0usize;
    for item in new_items {
        let key = item.get("bookSourceUrl")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        existing.retain(|e| e.get("bookSourceUrl").and_then(|v| v.as_str()) != Some(key));
        existing.push(item);
        added += 1;
    }
    storage::save_book_sources(&existing)?;
    Ok(format!("成功导入 {} 个书源", added))
}

#[tauri::command]
pub async fn import_sources_from_url(url: String) -> Result<String> {
    let body = execute_http_request(&url, "GET", None, None, Some("utf-8".into()), 30).await?;
    add_book_source(body).await
}

#[tauri::command]
pub async fn toggle_book_source(source_index: usize, enabled: bool) -> Result<bool> {
    let mut sources = storage::load_book_sources()?;
    if source_index >= sources.len() {
        return Err(crate::error::AbyssError::SourceNotFound(source_index.to_string()));
    }
    if let Some(obj) = sources[source_index].as_object_mut() {
        obj.insert("enabled".into(), Value::Bool(enabled));
    }
    storage::save_book_sources(&sources)?;
    Ok(enabled)
}

#[tauri::command]
pub async fn delete_book_source(source_index: usize) -> Result<bool> {
    let mut sources = storage::load_book_sources()?;
    if source_index >= sources.len() {
        return Err(crate::error::AbyssError::SourceNotFound(source_index.to_string()));
    }
    sources.remove(source_index);
    storage::save_book_sources(&sources)?;
    Ok(true)
}

#[tauri::command]
pub async fn delete_failed_sources() -> Result<usize> {
    let sources = storage::load_book_sources()?;
    let mut keep = Vec::new();
    let mut removed = 0;
    for source in &sources {
        let test_url = source.get("bookSourceUrl")
            .or_else(|| source.get("url"))
            .or_else(|| source.get("searchUrl"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if test_url.is_empty() {
            removed += 1;
            continue;
        }
        match execute_http_request(test_url, "GET", None, None, None, 10).await {
            Ok(_) => keep.push(source.clone()),
            Err(_) => removed += 1,
        }
    }
    storage::save_book_sources(&keep)?;
    Ok(removed)
}

#[tauri::command]
pub async fn test_book_source(source_index: usize) -> Result<String> {
    let sources = storage::load_book_sources()?;
    let source = sources.get(source_index)
        .ok_or_else(|| crate::error::AbyssError::SourceNotFound(source_index.to_string()))?;
    let test_url = source.get("bookSourceUrl")
        .or_else(|| source.get("url"))
        .or_else(|| source.get("searchUrl"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if test_url.is_empty() {
        return Err(crate::error::AbyssError::ConfigError("URL 无效".into()));
    }
    let start = Instant::now();
    match execute_http_request(test_url, "GET", None, None, None, 10).await {
        Ok(html) => {
            let elapsed = start.elapsed().as_millis();
            Ok(format!("连接成功 · {}ms · {}KB", elapsed, html.len() / 1024))
        }
        Err(e) => Err(crate::error::AbyssError::NetworkError(format!("连接失败: {}", e))),
    }
}

#[tauri::command]
pub async fn test_all_sources(app: tauri::AppHandle) -> Result<Vec<Value>> {
    let sources = storage::load_book_sources()?;
    let mut results = Vec::new();
    for (i, source) in sources.iter().enumerate() {
        let test_url = source.get("bookSourceUrl")
            .or_else(|| source.get("url"))
            .or_else(|| source.get("searchUrl"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let start = Instant::now();
        let status: String;
        let error: String;
        let time_ms: u128;
        let size_kb: usize;
        if test_url.is_empty() {
            status = "fail".into();
            error = "URL 无效".into();
            time_ms = 0;
            size_kb = 0;
        } else {
            match execute_http_request(test_url, "GET", None, None, None, 10).await {
                Ok(html) => {
                    status = "ok".into();
                    error = String::new();
                    time_ms = start.elapsed().as_millis();
                    size_kb = html.len() / 1024;
                }
                Err(e) => {
                    status = "fail".into();
                    error = e.to_string();
                    time_ms = 0;
                    size_kb = 0;
                }
            }
        }
        let result = serde_json::json!({
            "index": i,
            "name": source.get("bookSourceName").or_else(|| source.get("name")).and_then(|v| v.as_str()).unwrap_or(""),
            "status": status,
            "time_ms": time_ms,
            "size_kb": size_kb,
            "error": error,
        });
        let _ = app.emit("source-test-result", &result);
        results.push(result);
    }
    Ok(results)
}

#[tauri::command]
pub async fn get_explore_categories(source_index: usize) -> Result<Vec<Value>> {
    let sources = storage::load_book_sources()?;
    let source = sources.get(source_index)
        .ok_or_else(|| crate::error::AbyssError::SourceNotFound(source_index.to_string()))?;
    let explore_url = source.get("exploreUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if explore_url.is_empty() { return Ok(vec![]) }
    if explore_url.starts_with('[') {
        let categories: Vec<Value> = serde_json::from_str(explore_url).unwrap_or_default();
        return Ok(categories);
    }
    if explore_url.contains('\n') && explore_url.contains("::") {
        let cats: Vec<Value> = explore_url
            .split('\n')
            .filter(|line| line.contains("::"))
            .map(|line| {
                let parts: Vec<&str> = line.splitn(2, "::").collect();
                serde_json::json!({
                    "title": parts[0].trim(),
                    "url": parts.get(1).unwrap_or(&"").trim()
                })
            })
            .collect();
        return Ok(cats);
    }
    Ok(vec![])
}

fn parse_sources_json(json_str: &str) -> Result<Vec<Value>> {
    let data: Value = serde_json::from_str(json_str).map_err(|e| {
        crate::error::AbyssError::ParseError(format!("JSON 解析失败: {}", e))
    })?;

    // 单书源：{"bookSourceName": "...", "bookSourceUrl": "..."}
    if data.get("bookSourceUrl").or_else(|| data.get("bookSourceName")).is_some() {
        return Ok(vec![data]);
    }

    // 书源集合：[{}, {}]
    if let Some(arr) = data.as_array() {
        return Ok(arr.clone());
    }

    // 包装格式：{"sources": [...]}, {"data": [...]}, {"bookSources": [...]}
    if let Some(arr) = data.get("sources").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    if let Some(arr) = data.get("data").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    if let Some(arr) = data.get("bookSources").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    if let Some(arr) = data.get("list").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    if let Some(arr) = data.get("items").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }
    if let Some(arr) = data.get("result").and_then(|v| v.as_array()) {
        return Ok(arr.clone());
    }

    // 嵌套 data.data：{"data": {"sources": [...]}} 
    if let Some(inner) = data.get("data").and_then(|v| v.as_object()) {
        if let Some(arr) = inner.get("sources").and_then(|v| v.as_array()) {
            return Ok(arr.clone());
        }
        if let Some(arr) = inner.get("list").and_then(|v| v.as_array()) {
            return Ok(arr.clone());
        }
        if let Some(arr) = inner.get("items").and_then(|v| v.as_array()) {
            return Ok(arr.clone());
        }
    }

    // 遍历所有 key，找包含书源数组的
    if let Some(obj) = data.as_object() {
        for (_, value) in obj {
            if let Some(arr) = value.as_array() {
                if let Some(first) = arr.first() {
                    if first.get("bookSourceUrl").or_else(|| first.get("bookSourceName")).is_some() {
                        return Ok(arr.clone());
                    }
                }
            }
        }
    }

    // 什么都没匹配到
    Ok(vec![])
}
