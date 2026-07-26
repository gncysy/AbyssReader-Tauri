use crate::error::Result;
use crate::storage::cache::{self, CacheCategory};
use std::fs;

#[tauri::command]
pub async fn comic_fetch_image(
    url: String,
    source_json: String,
    comic_id: String,
) -> Result<serde_json::Value> {
    let cache_key = format!("{}/{}", comic_id, format!("{:x}", md5::compute(url.as_bytes())));
    if let Some(cached) = cache::cache_get(CacheCategory::Comic, &cache_key) {
        let content_type = detect_image_type(&cached);
        let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &cached);
        return Ok(serde_json::json!({
            "url": url,
            "cached": true,
            "data": format!("data:{};base64,{}", content_type, b64)
        }));
    }

    let source: serde_json::Value = serde_json::from_str(&source_json)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("书源 JSON 解析失败: {}", e)))?;

    let headers = build_headers(&source);
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;

    let mut req = client.get(&url);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }

    let response = req.send().await.map_err(|e| {
        crate::error::AbyssError::NetworkError(format!("DOWNLOAD_FAILED:{}", e))
    })?;

    let bytes = response.bytes().await
        .map_err(|e| crate::error::AbyssError::NetworkError(format!("READ_FAILED:{}", e)))?;

    cache::cache_put(CacheCategory::Comic, &cache_key, &bytes)?;

    let content_type = detect_image_type(&bytes);
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);

    Ok(serde_json::json!({
        "url": url,
        "cached": false,
        "data": format!("data:{};base64,{}", content_type, b64)
    }))
}

#[tauri::command]
pub async fn comic_prefetch_images(
    urls: Vec<String>,
    source_json: String,
    comic_id: String,
) -> Result<usize> {
    let source: serde_json::Value = serde_json::from_str(&source_json)
        .map_err(|e| crate::error::AbyssError::ParseError(format!("书源 JSON 解析失败: {}", e)))?;
    let headers = build_headers(&source);

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;

    let mut count = 0;
    for url in &urls {
        let cache_key = format!("{}/{}", comic_id, format!("{:x}", md5::compute(url.as_bytes())));
        if cache::cache_get(CacheCategory::Comic, &cache_key).is_some() {
            count += 1;
            continue;
        }

        let mut req = client.get(url);
        for (k, v) in &headers {
            req = req.header(k.as_str(), v.as_str());
        }

        if let Ok(response) = req.send().await {
            if let Ok(bytes) = response.bytes().await {
                if cache::cache_put(CacheCategory::Comic, &cache_key, &bytes).is_ok() {
                    count += 1;
                }
            }
        }
    }
    Ok(count)
}

#[tauri::command]
pub async fn comic_clear_cache(comic_id: String) -> Result<usize> {
    let dir = cache::get_category_dir(CacheCategory::Comic);
    let prefix = format!("{}/", comic_id);
    let mut count = 0;

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with(&prefix) {
                    fs::remove_file(entry.path()).ok();
                    count += 1;
                }
            }
        }
    }
    Ok(count)
}

fn build_headers(source: &serde_json::Value) -> Vec<(String, String)> {
    let mut headers = Vec::new();
    headers.push(("User-Agent".into(), "Mozilla/5.0 (Linux; Android 13; zh-cn; V2304A) AppleWebKit/537.36".into()));
    headers.push(("Referer".into(), source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or("").into()));
    headers.push(("Accept".into(), "image/avif,image/webp,image/apng,image/*,*/*;q=0.8".into()));

    if let Some(header_str) = source.get("header").and_then(|v| v.as_str()) {
        if !header_str.starts_with("@js:") && !header_str.starts_with("<js>") {
            if let Ok(h) = serde_json::from_str::<std::collections::HashMap<String, String>>(header_str) {
                for (k, v) in h { headers.push((k, v)); }
            }
        }
    }
    headers
}

fn detect_image_type(data: &[u8]) -> &str {
    if data.len() < 4 { return "image/webp"; }
    if data[0..2] == [0xFF, 0xD8] { return "image/jpeg"; }
    if data[0..4] == [0x89, 0x50, 0x4E, 0x47] { return "image/png"; }
    "image/webp"
}
