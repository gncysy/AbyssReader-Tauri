use crate::error::Result;
use crate::network::http::execute_http_request;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::fs;
use serde::Serialize;
use tauri::Manager;
use tauri::Emitter;
use tauri::WebviewWindowBuilder;
use tauri::Listener;
use tauri::WebviewUrl;
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
        r#"window.name=(function(){var u=[];document.querySelectorAll('img,picture source').forEach(function(e){var s=e.getAttribute('src')||e.getAttribute('data-src')||e.getAttribute('data-original');if(s&&s.startsWith('http'))u.push(s)});return JSON.stringify(Array.from(new Set(u)))})();"#.to_string()
    } else {
        r#"document.querySelectorAll('script,style,link,iframe,noscript,meta').forEach(function(el){el.remove()});window.name=JSON.stringify(document.documentElement.outerHTML);"#.to_string()
    };
    let (tx, rx) = oneshot::channel::<String>();
    let tx_shared = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    let wf = window.clone(); let jsf = write_js.clone(); let txc = tx_shared.clone();
    std::thread::spawn(move || {
        let wait = if is_comic { 3000u64 } else { 2000u64 };
        std::thread::sleep(Duration::from_millis(wait));
        let w = wf.clone();
        let _ = wf.run_on_main_thread(move || {
            let _ = w.eval(&jsf);
            std::thread::sleep(Duration::from_millis(200));
            let w2 = w.clone();
            let _ = w.eval_with_callback("window.name || ''", move |r| {
                let mut g = txc.lock().unwrap();
                if let Some(s) = g.take() { let _ = s.send(r); }
                let _ = w2.close();
            });
        });
    });
    match timeout(Duration::from_secs(timeout_secs), rx).await {
        Ok(inner) => { let _ = window.close(); inner.map_err(|e| crate::error::AbyssError::WebViewError(format!("{}", e))) }
        Err(_) => { let _ = window.close(); Err(crate::error::AbyssError::WebViewError("超时".into())) }
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
        .visible(true).focused(true).skip_taskbar(false).title(&title.unwrap_or_else(|| "登录".into())).user_agent(DEFAULT_UA);
    let window = builder.build().map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
    let tx_clone = tx_shared.clone();
    let _id = window.listen("tauri://destroyed", move |_| {
        let cj = crate::js_runtime::ops::get_cookies_json();
        let mut g = tx_clone.lock().unwrap();
        if let Some(s) = g.take() { let _ = s.send(cj); }
    });
    match timeout(Duration::from_secs(timeoutSecs.unwrap_or(300)), rx).await {
        Ok(inner) => { let _ = window.close(); inner.map_err(|e| crate::error::AbyssError::WebViewError(format!("{}", e))) }
        Err(_) => { let _ = window.close(); Err(crate::error::AbyssError::WebViewError("超时".into())) }
    }
}

#[tauri::command]
pub async fn show_browser(app: tauri::AppHandle, html: String, script: Option<String>, _options: Option<String>) -> Result<String> {
    let window_label = format!("browser_{}", uuid::Uuid::new_v4());
    let data_url = format!("data:text/html;charset=utf-8,{}", urlencoding::encode(&html));
    let parsed_url = url::Url::parse(&data_url).map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 data URL: {}", e)))?;
    let builder = WebviewWindowBuilder::new(&app, &window_label, tauri::WebviewUrl::External(parsed_url))
        .visible(true).focused(true).skip_taskbar(false).title("").user_agent(DEFAULT_UA);
    let window = builder.build().map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
    if let Some(js) = script { let _ = window.eval(&js); }
    let (tx, rx) = oneshot::channel::<String>();
    let tx_shared = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));
    let tc = tx_shared.clone();
    let _id = window.listen("tauri://destroyed", move |_| {
        let mut g = tc.lock().unwrap();
        if let Some(s) = g.take() { let _ = s.send("closed".into()); }
    });
    match timeout(Duration::from_secs(600), rx).await {
        Ok(inner) => { let _ = window.close(); inner.map_err(|e| crate::error::AbyssError::WebViewError(format!("{}", e))) }
        Err(_) => { let _ = window.close(); Err(crate::error::AbyssError::WebViewError("超时".into())) }
    }
}

fn get_downloads_dir() -> PathBuf {
    dirs_next::download_dir().unwrap_or_else(|| std::env::temp_dir().join("abyss_downloads"))
}

fn detect_resource_type(data: &str, url: &str) -> String {
    if data.contains("\"bookSourceUrl\"") || data.contains("\"bookSourceName\"") { return "bookSource".into() }
    if data.contains("\"sourceUrl\"") && data.contains("\"sourceName\"") { return "rssSource".into() }
    if data.contains("\"isRegex\"") || (data.contains("\"pattern\"") && data.contains("\"replacement\"")) { return "replaceRule".into() }
    if data.contains("\"chapterList\"") || data.contains("\"chapterName\"") { return "txtTocRule".into() }
    if url.ends_with(".txt") && !data.starts_with("{") && !data.starts_with("[") { return "purifyRule".into() }
    "unknown".into()
}

fn parse_json_count(data: &str) -> usize {
    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(data) { return arr.len() }
    if serde_json::from_str::<serde_json::Value>(data).is_ok() { return 1 }
    0
}

#[derive(Serialize, Clone)]
struct DownloadInfo {
    url: String,
    #[serde(rename = "fileName")]
    file_name: String,
    #[serde(rename = "fileSize")]
    file_size: usize,
    #[serde(rename = "resourceType")]
    resource_type: String,
    count: usize,
    #[serde(rename = "savedPath")]
    saved_path: Option<String>,
    error: Option<bool>,
    message: Option<String>,
}

async fn download_and_detect(url: &str) -> std::result::Result<DownloadInfo, String> {
    let data = execute_http_request(url, "GET", None, None, None, 30)
        .await
        .map_err(|e| format!("下载失败: {}", e))?;
    let bytes = data.into_bytes();
    let text = String::from_utf8_lossy(&bytes).to_string();
    let file_name = url.split('/').last().unwrap_or("download").to_string();
    let resource_type = detect_resource_type(&text, url);
    let count = if resource_type == "bookSource" || resource_type == "rssSource" { parse_json_count(&text) } else { 0 };
    let saved_path = if resource_type == "unknown" || url.ends_with(".zip") {
        let dir = get_downloads_dir();
        fs::create_dir_all(&dir).ok();
        let path = dir.join(&file_name);
        fs::write(&path, &bytes).ok();
        Some(path.to_string_lossy().to_string())
    } else { None };
    Ok(DownloadInfo { url: url.to_string(), file_name, file_size: bytes.len(), resource_type, count, saved_path, error: None, message: None })
}

fn show_loading(window: &tauri::WebviewWindow) {
    let _ = window.eval(r#"(function(){var m=document.createElement('div');m.id='__rss_loading';m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;color:#fff;font-size:16px;font-family:system-ui';m.innerHTML='<div style="text-align:center"><div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.2);border-top-color:#d4a017;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px"></div><div>正在下载...</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';document.body.appendChild(m);})()"#);
}
fn hide_loading(window: &tauri::WebviewWindow) {
    let _ = window.eval("(function(){var m=document.getElementById('__rss_loading');if(m)m.remove()})()");
}

fn is_download_url(url: &str) -> bool {
    url.ends_with(".json") || url.ends_with(".zip") || url.ends_with(".txt")
        || url.starts_with("yuedu://")
}

fn should_open_in_new_window(url: &str) -> bool {
    let http = url.starts_with("http://") || url.starts_with("https://");
    http && !is_download_url(url)
}

#[tauri::command]
pub async fn rss_open_url(app: tauri::AppHandle, url: String, title: String) -> Result<()> {
    let parsed_url = url::Url::parse(&url).map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 URL: {}", e)))?;
    let label = format!("rss_{}", uuid::Uuid::new_v4());
    let (pos_x, pos_y, win_w, win_h) = if let Some(main) = app.get_webview_window("main") {
        let p = main.outer_position().unwrap_or_default();
        let s = main.outer_size().unwrap_or_default();
        (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
    } else { (0.0, 0.0, 1000.0, 700.0) };
    let w = (win_w * 0.9).max(600.0);
    let h = (win_h * 0.9).max(400.0);
    let x = pos_x + (win_w - w) / 2.0;
    let y = pos_y + (win_h - h) / 2.0;

    let app_nav = app.clone(); let label_nav = label.clone();
    let app_win = app.clone(); let label_win = label.clone();
    let app_new = app.clone();

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed_url.clone()))
        .title(&title).inner_size(w, h).position(x.max(0.0), y.max(0.0))
        .decorations(true).resizable(true).visible(true).focused(true)
        .on_navigation(move |nav_url| {
            let mut url_str = nav_url.as_str().to_string();
            if url_str.starts_with("yuedu://") {
                if let Some(pos) = url_str.find("src=") {
                    let raw = &url_str[pos + 4..];
                    url_str = urlencoding::decode(raw).unwrap_or_else(|_| raw.into()).into_owned();
                } else { return true; }
            }
            if is_download_url(&url_str) {
                let app = app_nav.clone(); let lbl = label_nav.clone(); let url = url_str.clone();
                if let Some(window) = app_nav.get_webview_window(&lbl) { show_loading(&window); }
                tauri::async_runtime::spawn(async move {
                    match download_and_detect(&url).await {
                        Ok(info) => {
                            if let Some(w) = app.get_webview_window(&lbl) { hide_loading(&w); }
                            let _ = app.emit_to("main", "rss-download", serde_json::json!({
                                "url": info.url,
                                "fileName": info.file_name,
                                "fileSize": info.file_size,
                                "resourceType": info.resource_type,
                                "count": info.count,
                                "savedPath": info.saved_path,
                            }));
                        }
                        Err(e) => {
                            if let Some(w) = app.get_webview_window(&lbl) { hide_loading(&w); }
                            let _ = app.emit_to("main", "rss-download", serde_json::json!({
                                "error": true, "message": e
                            }));
                        }
                    }
                });
                false
            } else { true }
        })
        .on_new_window(move |new_url, _| {
            let url_str = new_url.as_str().to_string();
            if is_download_url(&url_str) {
                let app = app_win.clone(); let lbl = label_win.clone(); let url = url_str.clone();
                if let Some(window) = app_win.get_webview_window(&lbl) { show_loading(&window); }
                tauri::async_runtime::spawn(async move {
                    match download_and_detect(&url).await {
                        Ok(info) => {
                            if let Some(w) = app.get_webview_window(&lbl) { hide_loading(&w); }
                            let _ = app.emit_to("main", "rss-download", serde_json::json!({
                                "url": info.url,
                                "fileName": info.file_name,
                                "fileSize": info.file_size,
                                "resourceType": info.resource_type,
                                "count": info.count,
                                "savedPath": info.saved_path,
                            }));
                        }
                        Err(e) => {
                            if let Some(w) = app.get_webview_window(&lbl) { hide_loading(&w); }
                            let _ = app.emit_to("main", "rss-download", serde_json::json!({
                                "error": true, "message": e
                            }));
                        }
                    }
                });
            } else if should_open_in_new_window(&url_str) {
                let app = app_new.clone(); let url = url_str.clone();
                tauri::async_runtime::spawn(async move {
                    let title = url.split('/').nth(2).unwrap_or("新窗口");
                    let _ = rss_open_url_inner(&app, &url, title).await;
                });
            } else {
                let app = app_win.clone(); let lbl = label_win.clone(); let url = url_str.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(w) = app.get_webview_window(&lbl) {
                        let e = url.replace('\'', "\\'");
                        let _ = w.eval(&format!("window.location.href='{}'", e));
                    }
                });
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .build()
        .map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
    Ok(())
}

async fn rss_open_url_inner(app: &tauri::AppHandle, url: &str, title: &str) -> Result<()> {
    let parsed_url = url::Url::parse(url).map_err(|e| crate::error::AbyssError::ConfigError(format!("无效 URL: {}", e)))?;
    let label = format!("rss_{}", uuid::Uuid::new_v4());
    let (pos_x, pos_y, win_w, win_h) = if let Some(main) = app.get_webview_window("main") {
        let p = main.outer_position().unwrap_or_default();
        let s = main.outer_size().unwrap_or_default();
        (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
    } else { (0.0, 0.0, 1000.0, 700.0) };
    let w = (win_w * 0.7).max(400.0);
    let h = (win_h * 0.7).max(300.0);
    let x = pos_x + (win_w - w) / 2.0 + 30.0;
    let y = pos_y + (win_h - h) / 2.0 + 30.0;
    WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed_url))
        .title(title).inner_size(w, h).position(x.max(0.0), y.max(0.0))
        .decorations(true).resizable(true).visible(true).focused(true)
        .on_navigation(move |nav_url| !is_download_url(nav_url.as_str()))
        .build()
        .map_err(|e| crate::error::AbyssError::WebViewError(e.to_string()))?;
    Ok(())
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

