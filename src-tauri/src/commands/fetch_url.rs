use crate::error::Result;
use crate::network::http::execute_http_request;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::fs;
use serde::Serialize;
use tauri::WebviewWindowBuilder;
use tauri::Listener;
use tokio::sync::oneshot;
use tokio::time::timeout;
use std::time::Duration;

const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

static IMAGE_CACHE_DIR: OnceLock<PathBuf> = OnceLock::new();
pub fn set_image_cache_dir(dir: PathBuf) { let _ = IMAGE_CACHE_DIR.set(dir); }
fn get_cache_dir() -> PathBuf { IMAGE_CACHE_DIR.get().cloned().unwrap_or_else(|| std::env::temp_dir().join("abyss_image_cache")) }
fn clean_old_cache(dir: &PathBuf, max_files: usize) {
    if let Ok(entries) = fs::read_dir(dir) {
        let mut files: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        if files.len() > max_files {
            files.sort_by_key(|e| e.metadata().map(|m| m.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH)).unwrap_or(std::time::SystemTime::UNIX_EPOCH));
            let to_remove = files.len() - max_files;
            for entry in files.iter().take(to_remove) { let _ = fs::remove_file(entry.path()); }
        }
    }
}

#[derive(Serialize)]
pub struct FetchResponse { pub status: u16, pub data: String, }

#[tauri::command]
#[allow(non_snake_case)]
pub async fn fetch_url(
    app: tauri::AppHandle, url: String, method: Option<String>, body: Option<String>,
    headers: Option<HashMap<String, String>>, charset: Option<String>,
    useWebview: Option<bool>, webJs: Option<String>, timeoutSecs: Option<u64>, sourceType: Option<i32>,
) -> Result<String> {
    if useWebview.unwrap_or(false) {
        fetch_webview_inner(&app, &url, headers, webJs, timeoutSecs.unwrap_or(30), sourceType).await
    } else {
        let method_str = method.unwrap_or_else(|| "GET".into());
        let timeout = timeoutSecs.unwrap_or(30);
        execute_http_request(&url, &method_str, headers, body, charset, timeout).await
    }
}

async fn fetch_webview_inner(
    app: &tauri::AppHandle, url: &str, headers: Option<HashMap<String, String>>,
    web_js: Option<String>, timeout_secs: u64, source_type: Option<i32>,
) -> Result<String> {
    let parsed_url = url::Url::parse(url).map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 URL: {}", e)))?;
    let window_label = format!("webview_{}", uuid::Uuid::new_v4());
    let is_comic = source_type == Some(2);
    let is_novel = source_type == Some(0) || source_type.is_none();

    let block_script = if is_novel {
        r#"(function(){var o=new MutationObserver(function(){document.querySelectorAll('img,picture,source').forEach(function(e){e.remove()})});o.observe(document.documentElement,{childList:true,subtree:true});var l=new MutationObserver(function(){document.querySelectorAll('link[rel="stylesheet"],link[rel="preload"],link[rel="prefetch"],link[rel="font"]').forEach(function(e){e.remove()})});l.observe(document.documentElement,{childList:true,subtree:true});var s=new MutationObserver(function(){document.querySelectorAll('script:not([type="application/json"])').forEach(function(e){e.remove()})});s.observe(document.documentElement,{childList:true,subtree:true})})()"#
    } else if is_comic {
        r#"(function(){document.querySelectorAll('link[rel="font"],link[rel="preload"][as="font"]').forEach(function(e){e.remove()});document.querySelectorAll('script:not([data-main]):not([src*="lazyload"])').forEach(function(e){e.remove()});document.querySelectorAll('img[data-src],img[data-original]').forEach(function(e){var s=e.getAttribute('data-src')||e.getAttribute('data-original');if(s)e.setAttribute('src',s)})})()"#
    } else { "" };

    let mut builder = WebviewWindowBuilder::new(app, &window_label, tauri::WebviewUrl::External(parsed_url))
        .visible(false).focused(false).skip_taskbar(true).title("").user_agent(DEFAULT_UA);
    if let Some(h) = &headers { if let Some(ua) = h.get("User-Agent") { builder = builder.user_agent(ua); } }

    let window = builder.build().map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
    if !block_script.is_empty() { let _ = window.eval(block_script); }

    let write_js = if let Some(js) = &web_js {
        format!("window.name = (function(){{ return {}; }})();", js)
    } else if is_comic {
        r#"window.name = (function(){var urls=[];document.querySelectorAll('img,picture source').forEach(function(el){var s=el.getAttribute('src')||el.getAttribute('data-src')||el.getAttribute('data-original');if(s&&s.startsWith('http'))urls.push(s)});return JSON.stringify(Array.from(new Set(urls)))})();"#.to_string()
    } else {
        r#"document.querySelectorAll('script,style,link,iframe,noscript,meta').forEach(function(el){el.remove()});window.name=JSON.stringify(document.documentElement.outerHTML);"#.to_string()
    };

    let (tx, rx) = oneshot::channel::<String>();
    let tx_shared = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    let window_for_thread = window.clone();
    let write_js_for_thread = write_js.clone();
    let tx_for_callback = tx_shared.clone();

    std::thread::spawn(move || {
        let wait_ms = if is_comic { 3000u64 } else { 2000u64 };
        std::thread::sleep(Duration::from_millis(wait_ms));
        let w = window_for_thread.clone();
        let _ = window_for_thread.run_on_main_thread(move || {
            let _ = w.eval(&write_js_for_thread);
            std::thread::sleep(Duration::from_millis(200));
            let w2 = w.clone();
            let _ = w.eval_with_callback("window.name || ''", move |result| {
                let mut guard = tx_for_callback.lock().unwrap();
                if let Some(sender) = guard.take() { let _ = sender.send(result); }
                let _ = w2.close();
            });
        });
    });

    match timeout(Duration::from_secs(timeout_secs), rx).await {
        Ok(inner) => { let _ = window.close(); inner.map_err(|e| crate::error::AbyssError::WebViewError(format!("接收数据失败: {}", e))) }
        Err(_elapsed) => { let _ = window.close(); Err(crate::error::AbyssError::WebViewError("加载超时".into())) }
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn login_webview(app: tauri::AppHandle, url: String, title: Option<String>, timeoutSecs: Option<u64>) -> Result<String> {
    let parsed_url = url::Url::parse(&url).map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 URL: {}", e)))?;
    let window_label = format!("login_{}", uuid::Uuid::new_v4());
    let (tx, rx) = oneshot::channel::<String>();
    let tx_shared = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    
    let builder = WebviewWindowBuilder::new(&app, &window_label, tauri::WebviewUrl::External(parsed_url))
        .visible(true).focused(true).skip_taskbar(false)
        .title(&title.unwrap_or_else(|| "登录".into()))
        .user_agent(DEFAULT_UA);
    let window = builder.build().map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
    let tx_clone = tx_shared.clone();
    
    let _id = window.listen("tauri://destroyed", move |_| {
        let cookie_json = crate::js_runtime::ops::get_cookies_json();
        let mut guard = tx_clone.lock().unwrap();
        if let Some(sender) = guard.take() { let _ = sender.send(cookie_json); }
    });
    
    match timeout(Duration::from_secs(timeoutSecs.unwrap_or(300)), rx).await {
        Ok(inner) => { let _ = window.close(); inner.map_err(|e| crate::error::AbyssError::WebViewError(format!("{}", e))) }
        Err(_) => { let _ = window.close(); Err(crate::error::AbyssError::WebViewError("登录超时".into())) }
    }
}

#[tauri::command]
pub async fn show_browser(app: tauri::AppHandle, html: String, script: Option<String>, _options: Option<String>) -> Result<String> {
    let window_label = format!("browser_{}", uuid::Uuid::new_v4());
    let data_url = format!("data:text/html;charset=utf-8,{}", urlencoding::encode(&html));
    let parsed_url = url::Url::parse(&data_url).map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 data URL: {}", e)))?;
    
    let builder = WebviewWindowBuilder::new(&app, &window_label, tauri::WebviewUrl::External(parsed_url))
        .visible(true).focused(true).skip_taskbar(false).title("")
        .user_agent(DEFAULT_UA);
    let window = builder.build().map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
    
    if let Some(js) = script { let _ = window.eval(&js); }
    
    let (tx, rx) = oneshot::channel::<String>();
    let tx_shared = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    let tc = tx_shared.clone();
    
    let _id = window.listen("tauri://destroyed", move |_| {
        let mut guard = tc.lock().unwrap();
        if let Some(sender) = guard.take() { let _ = sender.send("closed".into()); }
    });
    
    match timeout(Duration::from_secs(600), rx).await {
        Ok(inner) => { let _ = window.close(); inner.map_err(|e| crate::error::AbyssError::WebViewError(format!("{}", e))) }
        Err(_) => { let _ = window.close(); Err(crate::error::AbyssError::WebViewError("弹窗超时".into())) }
    }
}

#[tauri::command]
pub async fn download_binary(url: String, headers: Option<HashMap<String, String>>) -> Result<String> {
    use reqwest::Client; use base64::Engine;
    let client = Client::builder().user_agent(DEFAULT_UA).danger_accept_invalid_certs(true).timeout(Duration::from_secs(30)).build()
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;
    let mut req = client.get(&url);
    if let Some(h) = headers { for (k, v) in h { req = req.header(k, v); } }
    let response = req.send().await.map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;
    let bytes = response.bytes().await.map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

#[tauri::command]
pub async fn proxy_image(url: String, source_json: String) -> Result<String> {
    use reqwest::Client; use base64::Engine;
    let source: serde_json::Value = serde_json::from_str(&source_json).map_err(|e| crate::error::AbyssError::ParseError(e.to_string()))?;
    let cache_dir = get_cache_dir(); fs::create_dir_all(&cache_dir).ok();
    let hash = format!("{:x}", md5::compute(url.as_bytes())); let file_path = cache_dir.join(&hash);
    if file_path.exists() { if let Ok(data) = fs::read(&file_path) { return Ok(format!("data:image/webp;base64,{}", base64::engine::general_purpose::STANDARD.encode(&data))); } }
    let client = Client::builder().danger_accept_invalid_certs(true).timeout(Duration::from_secs(30)).build()
        .map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;
    let mut req = client.get(&url);
    if let Some(header_str) = source.get("header").and_then(|v| v.as_str()) {
        if header_str.starts_with("@js:") || header_str.starts_with("<js>") {
            req = req.header("User-Agent", "Mozilla/5.0 (Linux; Android 13; zh-cn; V2304A) AppleWebKit/537.36")
                .header("Referer", source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or(""))
                .header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8");
        } else { if let Ok(h) = serde_json::from_str::<HashMap<String, String>>(header_str) { for (k, v) in h { req = req.header(k, v); } } }
    } else { req = req.header("User-Agent", "Mozilla/5.0 (Linux; Android 13; zh-cn; V2304A)"); }
    let response = req.send().await.map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;
    let final_url = response.url().to_string();
    let content_type = response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("image/webp").to_string();
    let bytes = if final_url.contains("link.webp") || final_url.contains("link/link.webp") {
        let mut req2 = client.get(&final_url); req2 = req2.header("Referer", source.get("bookSourceUrl").and_then(|v| v.as_str()).unwrap_or(""));
        let response2 = req2.send().await.map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?;
        response2.bytes().await.map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))?
    } else { response.bytes().await.map_err(|e| crate::error::AbyssError::NetworkError(e.to_string()))? };
    let _ = fs::write(&file_path, &bytes); clean_old_cache(&cache_dir, 100);
    Ok(format!("data:{};base64,{}", content_type, base64::engine::general_purpose::STANDARD.encode(&bytes)))
}
