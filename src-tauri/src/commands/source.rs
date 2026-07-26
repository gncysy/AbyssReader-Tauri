use crate::error::Result;
use crate::network::http::execute_http_request;
use crate::storage;
use serde_json::Value;
use std::time::Instant;
use tauri::Emitter;

#[tauri::command] pub async fn get_book_sources() -> Result<Value> { Ok(serde_json::Value::Array(storage::load_book_sources()?)) }
#[tauri::command] pub async fn add_book_source(source_json: String) -> Result<String> {
    let new_items = parse_sources_json(&source_json)?;
    if new_items.is_empty() { return Err(crate::error::AbyssError::ParseError("未找到有效的书源数据".into())); }
    let mut existing = storage::load_book_sources()?;
    for item in new_items { let key = item.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or(""); existing.retain(|e| e.get("bookSourceUrl").and_then(|v| v.as_str()) != Some(key)); existing.push(item); }
    storage::save_book_sources(&existing)?;
    Ok(format!("成功导入 {} 个书源", existing.len()))
}
#[tauri::command] pub async fn import_sources_from_url(url: String) -> Result<String> { let body = execute_http_request(&url, "GET", None, None, Some("utf-8".into()), 30).await?; add_book_source(body).await }
#[tauri::command] pub async fn toggle_book_source(source_index: usize, enabled: bool) -> Result<bool> {
    let mut sources = storage::load_book_sources()?;
    if source_index >= sources.len() { return Err(crate::error::AbyssError::SourceNotFound(source_index.to_string())); }
    if let Some(obj) = sources[source_index].as_object_mut() { obj.insert("enabled".into(), Value::Bool(enabled)); }
    storage::save_book_sources(&sources)?; Ok(enabled)
}
#[tauri::command] pub async fn delete_book_source(source_index: usize) -> Result<bool> {
    let mut sources = storage::load_book_sources()?;
    if source_index >= sources.len() { return Err(crate::error::AbyssError::SourceNotFound(source_index.to_string())); }
    sources.remove(source_index); storage::save_book_sources(&sources)?; Ok(true)
}
#[tauri::command] pub async fn delete_failed_sources() -> Result<usize> {
    let sources = storage::load_book_sources()?;
    let mut keep = Vec::new(); let mut removed = 0;
    for source in &sources { let test_url = source.get("bookSourceUrl").or_else(|| source.get("url")).or_else(|| source.get("searchUrl")).and_then(|v| v.as_str()).unwrap_or(""); if test_url.is_empty() { removed += 1; continue; } match execute_http_request(test_url, "GET", None, None, None, 10).await { Ok(_) => keep.push(source.clone()), Err(_) => removed += 1 } }
    storage::save_book_sources(&keep)?; Ok(removed)
}
#[tauri::command] pub async fn test_book_source(source_index: usize) -> Result<String> {
    let sources = storage::load_book_sources()?;
    let source = sources.get(source_index).ok_or_else(|| crate::error::AbyssError::SourceNotFound(source_index.to_string()))?;
    let test_url = source.get("bookSourceUrl").or_else(|| source.get("url")).or_else(|| source.get("searchUrl")).and_then(|v| v.as_str()).unwrap_or("");
    if test_url.is_empty() { return Err(crate::error::AbyssError::ConfigError("URL 无效".into())); }
    let start = Instant::now();
    match execute_http_request(test_url, "GET", None, None, None, 10).await { Ok(html) => Ok(format!("连接成功 · {}ms · {}KB", start.elapsed().as_millis(), html.len() / 1024)), Err(e) => Err(crate::error::AbyssError::NetworkError(format!("连接失败: {}", e))) }
}
#[tauri::command] pub async fn test_all_sources(app: tauri::AppHandle) -> Result<Vec<Value>> {
    let sources = storage::load_book_sources()?; let mut results = Vec::new();
    for (i, source) in sources.iter().enumerate() {
        let test_url = source.get("bookSourceUrl").or_else(|| source.get("url")).or_else(|| source.get("searchUrl")).and_then(|v| v.as_str()).unwrap_or("");
        let start = Instant::now(); let status: String; let error: String; let time_ms: u128; let size_kb: usize;
        if test_url.is_empty() { status = "fail".into(); error = "URL 无效".into(); time_ms = 0; size_kb = 0; }
        else { match execute_http_request(test_url, "GET", None, None, None, 10).await { Ok(html) => { status = "ok".into(); error = String::new(); time_ms = start.elapsed().as_millis(); size_kb = html.len() / 1024; } Err(e) => { status = "fail".into(); error = e.to_string(); time_ms = 0; size_kb = 0; } } }
        let result = serde_json::json!({"index": i, "name": source.get("bookSourceName").or_else(|| source.get("name")).and_then(|v| v.as_str()).unwrap_or(""), "status": status, "time_ms": time_ms, "size_kb": size_kb, "error": error});
        let _ = app.emit("source-test-result", &result); results.push(result);
    }
    Ok(results)
}

fn prepare_js_code(code: &str) -> String {
    let trimmed = code.trim();
    if trimmed.is_empty() { return code.to_string(); }
    let js = trimmed.strip_prefix("@js:").unwrap_or(trimmed);
    let js = js.trim_start().strip_prefix("<js>").and_then(|s| s.strip_suffix("</js>")).unwrap_or(js).trim();
    if js.contains("return ") || js.contains("return(") || js.contains("\nreturn") { return js.to_string(); }
    let lines: Vec<&str> = js.lines().collect();
    if lines.is_empty() { return js.to_string(); }
    let mut last = lines.len();
    while last > 0 && lines[last - 1].trim().is_empty() { last -= 1; }
    if last == 0 { return js.to_string(); }
    let decl = ["var ", "let ", "const ", "function ", "class ", "import ", "export "];
    let stmt = ["if ", "for ", "while ", "switch ", "try ", "throw ", "break ", "continue ", "debugger "];
    let mut expr_idx: Option<usize> = None;
    let mut i = last;
    while i > 0 {
        i -= 1;
        let line = lines[i].trim();
        if line.is_empty() { continue; }
        if !decl.iter().any(|k| line.starts_with(k)) && !stmt.iter().any(|k| line.starts_with(k)) {
            expr_idx = Some(i); break;
        }
    }
    match expr_idx {
        Some(idx) => {
            let mut result = String::new();
            for (j, line) in lines.iter().enumerate() {
                if j == idx { result.push_str(&format!("return {};", line.trim().trim_end_matches(';').trim())); }
                else { result.push_str(line); }
                if j < lines.len() - 1 { result.push('\n'); }
            }
            result
        }
        None => js.to_string(),
    }
}

#[tauri::command]
pub async fn get_explore_categories(source_index: usize) -> Result<Vec<Value>> {
    let sources = storage::load_book_sources()?;
    let source = sources.get(source_index).ok_or_else(|| crate::error::AbyssError::SourceNotFound(source_index.to_string()))?;
    let explore_url = source.get("exploreUrl").and_then(|v| v.as_str()).unwrap_or("");
    if explore_url.is_empty() { return Ok(vec![]) }
    if explore_url.trim().starts_with('[') { return Ok(serde_json::from_str(explore_url).unwrap_or_default()); }
    if explore_url.contains("@js:") || explore_url.contains("<js>") {
        let js_code = prepare_js_code(explore_url);
        let ctx = serde_json::json!({"source": source, "baseUrl": source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or(""),});
        match crate::js_runtime::runtime::execute(&js_code, &serde_json::to_string(&ctx).unwrap_or_default()) {
            Ok(result) => {
                let trimmed = result.trim();
                if let Ok(cats) = serde_json::from_str::<Vec<Value>>(trimmed) { return Ok(cats); }
                if let Ok(obj) = serde_json::from_str::<serde_json::Map<String, Value>>(trimmed) {
                    if let Some(arr) = obj.get("categories").or_else(|| obj.get("data")).and_then(|v| v.as_array()) { return Ok(arr.clone()); }
                }
                return Ok(vec![]);
            }
            Err(_e) => { return Ok(vec![]); }
        }
    }
    if explore_url.contains('\n') && explore_url.contains("::") {
        let cats: Vec<Value> = explore_url.split('\n').filter(|l| l.contains("::")).map(|l| { let p: Vec<&str> = l.splitn(2, "::").collect(); serde_json::json!({"title": p[0].trim(), "url": p.get(1).unwrap_or(&"").trim()}) }).collect();
        return Ok(cats);
    }
    if explore_url.contains("::") {
        let p: Vec<&str> = explore_url.splitn(2, "::").collect();
        if p.len() >= 2 { return Ok(vec![serde_json::json!({"title": p[0].trim(), "url": p[1].trim()})]); }
    }
    Ok(vec![])
}

fn parse_sources_json(json_str: &str) -> Result<Vec<Value>> {
    let data: Value = serde_json::from_str(json_str).map_err(|e| crate::error::AbyssError::ParseError(format!("JSON 解析失败: {}", e)))?;
    if data.get("bookSourceUrl").or_else(|| data.get("bookSourceName")).is_some() { return Ok(vec![data]) }
    if let Some(arr) = data.as_array() { return Ok(arr.clone()) }
    if let Some(arr) = data.get("sources").and_then(|v| v.as_array()) { return Ok(arr.clone()) }
    if let Some(arr) = data.get("data").and_then(|v| v.as_array()) { return Ok(arr.clone()) }
    if let Some(arr) = data.get("bookSources").and_then(|v| v.as_array()) { return Ok(arr.clone()) }
    if let Some(arr) = data.get("list").and_then(|v| v.as_array()) { return Ok(arr.clone()) }
    if let Some(inner) = data.get("data").and_then(|v| v.as_object()) { if let Some(arr) = inner.get("sources").and_then(|v| v.as_array()) { return Ok(arr.clone()) } }
    if let Some(obj) = data.as_object() { for (_, v) in obj { if let Some(arr) = v.as_array() { if let Some(f) = arr.first() { if f.get("bookSourceUrl").or_else(|| f.get("bookSourceName")).is_some() { return Ok(arr.clone()) } } } } }
    Ok(vec![])
}

// ============================================
// 书源优化命令
// ============================================

const OPTIMIZE_MARK: &str = "[V8已优化]";

#[tauri::command]
pub async fn optimize_book_source(source_json: String) -> Result<String> {
    let mut source: Value = serde_json::from_str(&source_json)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("JSON 解析失败: {}", e)))?;

    let js_fields = ["exploreUrl", "searchUrl", "jsLib", "loginUrl", "loginUi", "loginCheckJs"];
    let rule_fields = ["ruleBookInfo", "ruleContent", "ruleExplore", "ruleSearch", "ruleToc"];
    let mut optimized_count = 0;

    // 批量收集所有需要转换的 JS 代码段
    let mut code_snippets: Vec<String> = Vec::new();

    if let Some(obj) = source.as_object_mut() {
        for field in &js_fields {
            if let Some(Value::String(s)) = obj.get(*field) {
                if s.contains("<js>") || s.contains("@js:") {
                    let js = s.trim()
                        .strip_prefix("@js:").or_else(|| s.trim().strip_prefix("<js>"))
                        .unwrap_or(s)
                        .trim_end().strip_suffix("</js>").unwrap_or(s)
                        .trim().to_string();
                    code_snippets.push(js);
                }
            }
        }
        for field in &rule_fields {
            if let Some(Value::Object(rule_obj)) = obj.get_mut(*field) {
                for (_, v) in rule_obj.iter() {
                    if let Value::String(s) = v {
                        if s.contains("<js>") || s.contains("@js:") {
                            let js = s.trim()
                                .strip_prefix("@js:").or_else(|| s.trim().strip_prefix("<js>"))
                                .unwrap_or(s)
                                .trim_end().strip_suffix("</js>").unwrap_or(s)
                                .trim().to_string();
                            code_snippets.push(js);
                        }
                    }
                }
            }
        }
    }

    // 转换所有代码段（每个独立转换）
    for snippet in &code_snippets {
        let fixed = crate::js_runtime::runtime::fix_v8_compat_public(snippet);
        if fixed != *snippet { optimized_count += 1; }
    }

    if optimized_count == 0 {
        return Err(crate::error::AbyssError::ParseError("该书源没有需要优化的 JS 代码".into()));
    }

    // 在备注中打标记
    if let Some(obj) = source.as_object_mut() {
        let comment = obj.get("bookSourceComment")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !comment.contains(OPTIMIZE_MARK) {
            let new_comment = format!("{} {}", OPTIMIZE_MARK, comment);
            obj.insert("bookSourceComment".into(), Value::String(new_comment));
        }
        obj.insert("_v8_optimized".into(), Value::Bool(true));
    }

    Ok(serde_json::to_string(&source)?)
}

#[tauri::command]
pub async fn optimize_book_sources(indices: Vec<usize>) -> Result<Vec<String>> {
    let mut sources = storage::load_book_sources()?;
    let mut results = Vec::new();

    for &index in &indices {
        if index >= sources.len() {
            results.push(format!("索引 {} 超出范围", index));
            continue;
        }
        let name = sources[index].get("bookSourceName").and_then(|v| v.as_str()).unwrap_or("未知").to_string();
        let source_json = serde_json::to_string(&sources[index])?;
        match optimize_book_source(source_json).await {
            Ok(optimized) => {
                if let Ok(new_source) = serde_json::from_str::<Value>(&optimized) {
                    sources[index] = new_source;
                    results.push(format!("{} 已优化", name));
                } else {
                    results.push(format!("{} 序列化失败", name));
                }
            }
            Err(e) => { results.push(format!("{} : {}", name, e)); }
        }
    }
    storage::save_book_sources(&sources)?;
    Ok(results)
}
