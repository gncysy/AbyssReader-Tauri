use crate::error::Result;
use crate::storage::{cache, db};
use serde_json::json;

#[tauri::command]
pub async fn cache_get_info() -> Result<serde_json::Value> {
    let total_size = cache::cache_size();
    let categories = cache::cache_size_by_category();
    let dir = cache::get_cache_dir();
    let config = get_cache_config();

    Ok(json!({
        "path": dir.to_string_lossy(),
        "totalSize": total_size,
        "totalSizeFormatted": format_size(total_size),
        "maxTotalBytes": config.get("maxTotalBytes").and_then(|v| v.as_u64()).unwrap_or(200 * 1024 * 1024),
        "maxTotalFormatted": format_size(config.get("maxTotalBytes").and_then(|v| v.as_u64()).unwrap_or(200 * 1024 * 1024)),
        "categories": categories.iter().map(|(name, size, count)| {
            json!({
                "name": name,
                "size": size,
                "sizeFormatted": format_size(*size),
                "count": count
            })
        }).collect::<Vec<_>>()
    }))
}

#[tauri::command]
pub async fn cache_clear() -> Result<serde_json::Value> {
    let count = cache::cache_clear_all()?;
    Ok(json!({ "removed": count }))
}

#[tauri::command]
pub async fn cache_clear_category(category: String) -> Result<serde_json::Value> {
    let cat = match category.as_str() {
        "covers" | "cover" => cache::CacheCategory::Cover,
        "toc" => cache::CacheCategory::Toc,
        "content" => cache::CacheCategory::Content,
        "comic" => cache::CacheCategory::Comic,
        _ => return Err(crate::error::AbyssError::ConfigError(format!("未知缓存分类: {}", category))),
    };
    let count = cache::cache_clear_category(cat)?;
    Ok(json!({ "removed": count }))
}

#[tauri::command]
pub async fn cache_get_cover(url: String) -> Result<Option<String>> {
    use base64::Engine;
    if let Some(data) = cache::cache_get(cache::CacheCategory::Cover, &url) {
        let ct = detect_image_type(&data);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
        Ok(Some(format!("data:{};base64,{}", ct, b64)))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn cache_put_cover(url: String, data_base64: String) -> Result<String> {
    use base64::Engine;
    let clean = if let Some(idx) = data_base64.find(";base64,") {
        data_base64[idx + 8..].to_string()
    } else { data_base64 };
    let data = base64::engine::general_purpose::STANDARD
        .decode(&clean)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("base64 解码失败: {}", e)))?;
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
        let clean = if let Some(idx) = data_str.find(";base64,") {
            data_str[idx + 8..].to_string()
        } else { data_str.to_string() };
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
pub async fn cache_has_cover(url: String) -> Result<bool> {
    Ok(cache::cache_exists(cache::CacheCategory::Cover, &url, 7 * 24 * 3600))
}

// ============================================
// 缓存配置与迁移
// ============================================

#[tauri::command]
pub async fn cache_set_max_size(max_mb: u64) -> Result<serde_json::Value> {
    let max_bytes = max_mb * 1024 * 1024;
    let config = json!({ "maxTotalBytes": max_bytes });
    db::store_set("cacheConfig", &config.to_string())?;
    // 立即检查是否超限
    cache::cache_put(crate::storage::cache::CacheCategory::Cover, "_check", &[]).ok();
    Ok(json!({ "maxTotalBytes": max_bytes, "maxTotalFormatted": format_size(max_bytes) }))
}

#[tauri::command]
pub async fn cache_migrate(new_path: String) -> Result<serde_json::Value> {
    let new_dir = std::path::PathBuf::from(&new_path);
    cache::set_cache_dir(&new_dir)?;
    let info = get_cache_info_inner();
    Ok(info)
}

fn get_cache_info_inner() -> serde_json::Value {
    let total_size = cache::cache_size();
    let categories = cache::cache_size_by_category();
    let dir = cache::get_cache_dir();
    let config = get_cache_config();
    json!({
        "path": dir.to_string_lossy(),
        "totalSize": total_size,
        "totalSizeFormatted": format_size(total_size),
        "maxTotalBytes": config.get("maxTotalBytes").and_then(|v| v.as_u64()).unwrap_or(200 * 1024 * 1024),
        "maxTotalFormatted": format_size(config.get("maxTotalBytes").and_then(|v| v.as_u64()).unwrap_or(200 * 1024 * 1024)),
        "categories": categories.iter().map(|(name, size, count)| {
            json!({ "name": name, "size": size, "sizeFormatted": format_size(*size), "count": count })
        }).collect::<Vec<_>>()
    })
}

fn get_cache_config() -> serde_json::Value {
    if let Ok(Some(raw)) = db::store_get("cacheConfig") {
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        json!({ "maxTotalBytes": 200 * 1024 * 1024u64 })
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
