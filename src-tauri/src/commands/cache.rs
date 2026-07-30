use crate::error::Result;
use crate::storage::{cache, db};
use serde_json::json;

#[tauri::command]
pub async fn cache_get_info() -> Result<serde_json::Value> {
    let cache_dir = cache::get_cache_dir();
    let config = get_cache_config();
    let max_total = config.get("maxTotalBytes").and_then(|v| v.as_u64()).unwrap_or(200 * 1024 * 1024);

    let mut categories: Vec<serde_json::Value> = Vec::new();
    let mut total_size: u64 = 0;

    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let (size, count) = dir_stats(&path);
                    total_size += size;
                    categories.push(json!({
                        "name": format_dir_name(name),
                        "key": name.to_string(),
                        "size": size,
                        "sizeFormatted": format_size(size),
                        "count": count
                    }));
                }
            }
        }
    }

    let parent = cache_dir.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| cache_dir.clone());
    for extra_dir in &["image_cache", "lib_cache"] {
        let path = parent.join(extra_dir);
        if path.exists() && path.is_dir() {
            let (size, count) = dir_stats(&path);
            total_size += size;
            categories.push(json!({
                "name": extra_dir,
                "key": extra_dir.to_string(),
                "size": size,
                "sizeFormatted": format_size(size),
                "count": count
            }));
        }
    }

    categories.sort_by(|a, b| b["size"].as_u64().unwrap_or(0).cmp(&a["size"].as_u64().unwrap_or(0)));

    Ok(json!({
        "path": cache_dir.to_string_lossy(),
        "totalSize": total_size,
        "totalSizeFormatted": format_size(total_size),
        "maxTotalBytes": max_total,
        "maxTotalFormatted": format_size(max_total),
        "categories": categories
    }))
}

#[tauri::command]
pub async fn cache_clear() -> Result<serde_json::Value> {
    let count = cache::cache_clear_all()?;
    Ok(json!({ "removed": count }))
}

#[tauri::command]
pub async fn cache_clear_category(category: String) -> Result<serde_json::Value> {
    let count = match category.as_str() {
        "image_cache" | "lib_cache" => {
            let parent = cache::get_cache_dir().parent().map(|p| p.to_path_buf()).unwrap_or_else(|| cache::get_cache_dir());
            let dir = parent.join(&category);
            let count = std::fs::read_dir(&dir).map(|d| d.count()).unwrap_or(0);
            if dir.exists() { std::fs::remove_dir_all(&dir)?; std::fs::create_dir_all(&dir)?; }
            count
        }
        _ => {
            let cat = match category.as_str() {
                "covers" | "cover" => cache::CacheCategory::Cover,
                "toc" => cache::CacheCategory::Toc,
                "content" => cache::CacheCategory::Content,
                "comic" => cache::CacheCategory::Comic,
                _ => return Err(crate::error::AbyssError::ConfigError(format!("未知缓存分类: {}", category))),
            };
            cache::cache_clear_category(cat)?
        }
    };
    Ok(json!({ "removed": count }))
}

#[tauri::command]
pub async fn cache_get_cover(url: String) -> Result<Option<String>> {
    use base64::Engine;
    if let Some(data) = cache::cache_get(cache::CacheCategory::Cover, &url) {
        let ct = detect_image_type(&data);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
        Ok(Some(format!("data:{};base64,{}", ct, b64)))
    } else { Ok(None) }
}

#[tauri::command]
pub async fn cache_put_cover(url: String, data_base64: String) -> Result<String> {
    use base64::Engine;
    let clean = if let Some(idx) = data_base64.find(";base64,") { data_base64[idx + 8..].to_string() } else { data_base64 };
    let data = base64::engine::general_purpose::STANDARD.decode(&clean).map_err(|e| crate::error::AbyssError::ParseError(format!("base64 解码失败: {}", e)))?;
    cache::cache_put(cache::CacheCategory::Cover, &url, &data)?;
    Ok(url)
}

#[tauri::command]
pub async fn cache_put_covers(items: Vec<serde_json::Value>) -> Result<usize> {
    use base64::Engine;
    let mut count = 0;
    for item in &items {
        let url = item.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let data_str = item.get("data").and_then(|v| v.as_str()).unwrap_or("");
        if url.is_empty() || data_str.is_empty() { continue; }
        let clean = if let Some(idx) = data_str.find(";base64,") { data_str[idx + 8..].to_string() } else { data_str.to_string() };
        if let Ok(data) = base64::engine::general_purpose::STANDARD.decode(&clean) {
            if cache::cache_put(cache::CacheCategory::Cover, url, &data).is_ok() { count += 1; }
        }
    }
    Ok(count)
}

#[tauri::command]
pub async fn cache_put_toc(book_url: String, data_json: String) -> Result<String> {
    cache::cache_put(cache::CacheCategory::Toc, &book_url, data_json.as_bytes())?;
    Ok(book_url)
}

#[tauri::command]
pub async fn cache_get_toc(book_url: String) -> Result<Option<String>> {
    if let Some(data) = cache::cache_get(cache::CacheCategory::Toc, &book_url) {
        Ok(String::from_utf8(data).ok())
    } else { Ok(None) }
}

#[tauri::command]
pub async fn cache_put_content(book_url: String, data_json: String) -> Result<String> {
    cache::cache_put(cache::CacheCategory::Content, &book_url, data_json.as_bytes())?;
    Ok(book_url)
}

#[tauri::command]
pub async fn cache_get_content(book_url: String) -> Result<Option<String>> {
    if let Some(data) = cache::cache_get(cache::CacheCategory::Content, &book_url) {
        Ok(String::from_utf8(data).ok())
    } else { Ok(None) }
}

#[tauri::command]
pub async fn cache_has_cover(url: String) -> Result<bool> {
    Ok(cache::cache_exists(cache::CacheCategory::Cover, &url, 7 * 24 * 3600))
}

#[tauri::command]
pub async fn cache_set_max_size(max_mb: u64) -> Result<serde_json::Value> {
    let max_bytes = max_mb * 1024 * 1024;
    let config = json!({ "maxTotalBytes": max_bytes });
    db::store_set("cacheConfig", &config.to_string())?;
    Ok(json!({ "maxTotalBytes": max_bytes, "maxTotalFormatted": format_size(max_bytes) }))
}

#[tauri::command]
pub async fn cache_migrate(new_path: String) -> Result<serde_json::Value> {
    let new_dir = std::path::PathBuf::from(&new_path);
    cache::set_cache_dir(&new_dir)?;
    Ok(json!({ "path": new_dir.to_string_lossy() }))
}

fn get_cache_config() -> serde_json::Value {
    if let Ok(Some(raw)) = db::store_get("cacheConfig") {
        serde_json::from_str(&raw).unwrap_or(json!({ "maxTotalBytes": 200 * 1024 * 1024u64 }))
    } else { json!({ "maxTotalBytes": 200 * 1024 * 1024u64 }) }
}

fn dir_stats(path: &std::path::PathBuf) -> (u64, usize) {
    let mut size: u64 = 0;
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() { let (s, c) = dir_stats(&p); size += s; count += c; }
            else if let Ok(meta) = p.metadata() { size += meta.len(); count += 1; }
        }
    }
    (size, count)
}

fn format_dir_name(name: &str) -> String {
    match name {
        "covers" | "cover" => "封面缓存".into(),
        "toc" => "目录缓存".into(),
        "content" => "正文缓存".into(),
        "comic" => "漫画缓存".into(),
        "image_cache" => "图片缓存".into(),
        "lib_cache" => "JS库缓存".into(),
        _ => name.to_string(),
    }
}

fn detect_image_type(data: &[u8]) -> &str {
    if data.len() < 4 { return "image/webp"; }
    if data[0..2] == [0xFF, 0xD8] { return "image/jpeg"; }
    if data[0..4] == [0x89, 0x50, 0x4E, 0x47] { return "image/png"; }
    "image/webp"
}

fn format_size(bytes: u64) -> String {
    if bytes < 1024 { format!("{} B", bytes) }
    else if bytes < 1024 * 1024 { format!("{:.1} KB", bytes as f64 / 1024.0) }
    else if bytes < 1024 * 1024 * 1024 { format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0)) }
    else { format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0)) }
}
