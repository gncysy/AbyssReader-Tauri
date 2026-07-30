use deno_core::op2;
use std::collections::HashMap;
use aes::cipher::BlockDecryptMut;
use std::sync::mpsc::{sync_channel, SyncSender, Receiver};
use std::sync::LazyLock;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Emitter;

type AjaxRequest = (String, Option<String>, Option<HashMap<String, String>>, Option<String>);
type AjaxResponse = Result<String, String>;

static GLOBAL_UA: OnceLock<String> = OnceLock::new();
pub fn set_global_ua(ua: String) { let _ = GLOBAL_UA.set(ua); }
pub fn get_ua() -> String {
    let stored = STORAGE.lock();
    if let Some(default_map) = stored.get("default") {
        if let Some(ua) = default_map.get("userAgent") { if !ua.is_empty() { return ua.clone(); } }
    }
    GLOBAL_UA.get().cloned().unwrap_or_else(|| "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string())
}

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
pub fn set_app_handle(handle: tauri::AppHandle) { let _ = APP_HANDLE.set(handle); }
fn emit_log(level: &str, msg: &str) {
    if let Some(handle) = APP_HANDLE.get() { let _ = handle.emit("global-log", &serde_json::json!({ "level": level, "module": "explore", "source": "rust", "message": msg })); }
}

fn parse_ajax_url(raw: &str) -> (String, Option<String>, Option<HashMap<String, String>>, Option<String>) {
    if let Some(comma) = raw.find(",{") {
        let url = raw[..comma].to_string();
        let fixed = raw[comma+1..].replace('\'', "\"");
        let parsed = serde_json::from_str::<serde_json::Value>(&fixed).ok();
        let method = parsed.as_ref().and_then(|v| v.get("method").and_then(|m| m.as_str()).map(|s| s.to_uppercase()));
        let headers = parsed.as_ref().and_then(|v| v.get("headers").cloned()).and_then(|h| serde_json::from_str::<HashMap<String, String>>(&h.to_string()).ok());
        let body = parsed.as_ref().and_then(|v| v.get("body").and_then(|b| if b.is_string() { Some(b.as_str().unwrap().to_string()) } else { Some(b.to_string()) }));
        (url, method, headers, body)
    } else { (raw.to_string(), None, None, None) }
}

struct RateLimitRecord { time: i64, access_limit: i32, interval: i64, frequency: i32 }
static RATE_LIMITER: LazyLock<parking_lot::Mutex<HashMap<String, parking_lot::Mutex<RateLimitRecord>>>> = LazyLock::new(|| parking_lot::Mutex::new(HashMap::new()));

fn rate_limit(url: &str) {
    let host = url::Url::parse(url).ok().and_then(|u| u.host_str().map(|s| s.to_string())).unwrap_or_else(|| "unknown".into());
    let mut map = RATE_LIMITER.lock();
    let mutex = map.entry(host.clone()).or_insert_with(|| parking_lot::Mutex::new(RateLimitRecord { time: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64, access_limit: 3, interval: 1000, frequency: 0 }));
    let mut record = mutex.lock();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
    let next_time = record.time + record.interval;
    if now >= next_time { record.time = now; record.frequency = 1; }
    else if record.frequency < record.access_limit { record.frequency += 1; }
    else { let wait_time = next_time - now; drop(record); std::thread::sleep(std::time::Duration::from_millis(wait_time as u64)); }
}

static AJAX_TX: LazyLock<SyncSender<(AjaxRequest, SyncSender<AjaxResponse>)>> = LazyLock::new(|| {
    let (tx, rx): (SyncSender<(AjaxRequest, SyncSender<AjaxResponse>)>, Receiver<(AjaxRequest, SyncSender<AjaxResponse>)>) = sync_channel(256);
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async move {
            let client = reqwest::Client::builder().user_agent(get_ua()).danger_accept_invalid_certs(true).build().unwrap();
            while let Ok(((url, method, headers, body), reply_tx)) = rx.recv() {
                rate_limit(&url);
                let mut req = if method.as_deref() == Some("POST") { client.post(&url) } else { client.get(&url) };
                if let Some(h) = &headers { for (k, v) in h { req = req.header(k.as_str(), v.as_str()); } }
                if let Some(b) = &body { req = req.body(b.clone()); }
                let result = match req.send().await {
                    Ok(resp) => { match resp.text().await { Ok(text) => Ok(text), Err(e) => Err(format!("response error: {}", e)) } },
                    Err(e) => Err(format!("request error: {}", e)),
                };
                let _ = reply_tx.send(result);
            }
        });
    });
    tx
});

#[op2] #[string] pub fn op_java_ajax(#[string] url: String) -> String {
    let (req_url, method, headers, body) = parse_ajax_url(&url);
    let (reply_tx, reply_rx): (SyncSender<AjaxResponse>, Receiver<AjaxResponse>) = sync_channel(1);
    if AJAX_TX.send(((req_url, method, headers, body), reply_tx)).is_ok() {
        match reply_rx.recv_timeout(std::time::Duration::from_secs(30)) {
            Ok(Ok(text)) => text, Ok(Err(e)) => format!("error: {}", e), Err(_) => "error: timeout".to_string(),
        }
    } else { "error: send failed".to_string() }
}

#[op2] #[string] pub fn op_java_web_js(#[string] html: String, #[string] js: String) -> String {
    let app_handle = APP_HANDLE.get().unwrap().clone();
    let (tx, rx) = std::sync::mpsc::channel();
    let html = html.clone(); let js = js.clone(); let tx2 = tx.clone(); let ah = app_handle.clone();
    app_handle.run_on_main_thread(move || {
        let label = format!("webjs_{}", uuid::Uuid::new_v4());
        let window = tauri::WebviewWindowBuilder::new(&ah, &label, tauri::WebviewUrl::App("about:blank".into())).visible(false).title("").build().unwrap();
        let _ = window.eval(&format!("document.write({});", serde_json::to_string(&html).unwrap()));
        std::thread::sleep(std::time::Duration::from_millis(300));
        let _ = window.eval(&format!("window.name = (function(){{ {} }})();", js));
        std::thread::spawn(move || {
            let intervals = [200u64,400,600,800,1000];
            for retry in 0..31 {
                let (tx_inner, rx_inner) = std::sync::mpsc::channel();
                let w = window.clone();
                let _ = w.eval_with_callback("window.name || ''", move |result| { let _ = tx_inner.send(result); });
                if let Ok(result) = rx_inner.recv_timeout(std::time::Duration::from_secs(3)) {
                    if !result.is_empty() && result != "null" { let _ = tx2.send(result); let _ = window.close(); return; }
                }
                let delay = if retry < intervals.len() as i32 { intervals[retry as usize] } else { intervals[intervals.len()-1] };
                std::thread::sleep(std::time::Duration::from_millis(delay));
            }
            let _ = tx2.send(String::new()); let _ = window.close();
        });
    }).ok();
    rx.recv_timeout(std::time::Duration::from_secs(30)).unwrap_or_default()
}

#[op2] #[string] pub fn op_jsoup_parse(#[string] html: String) -> String {
    use scraper::Html;
    let doc = Html::parse_document(&html);
    let root = element_to_json(&doc.root_element());
    let result = serde_json::json!({ "html": html, "root": root });
    result.to_string()
}

fn element_to_json(el: &scraper::ElementRef) -> serde_json::Value {
    use scraper::Node;
    let mut children = vec![];
    for child in el.children() {
        match child.value() {
            Node::Element(_) => { if let Some(child_el) = scraper::ElementRef::wrap(child) { children.push(element_to_json(&child_el)); } }
            Node::Text(t) => { let text = t.to_string().trim().to_string(); if !text.is_empty() { children.push(serde_json::json!({ "#text": text })); } }
            _ => {}
        }
    }
    let tag = el.value().name().to_string();
    let mut attrs = serde_json::Map::new();
    for attr in &el.value().attrs {
        let key = attr.0.local.to_string();
        let val = attr.1.to_string();
        attrs.insert(key, val.into());
    }
    if let Some(id) = el.value().id() { attrs.entry("id".to_string()).or_insert(id.into()); }
    serde_json::json!({ "tag": tag, "attrs": attrs, "children": children })
}

#[op2] #[string] pub fn op_java_base64_encode(#[string] input: String) -> String { use base64::Engine; base64::engine::general_purpose::STANDARD.encode(input.as_bytes()) }
#[op2] #[string] pub fn op_java_base64_decode(#[string] input: String) -> String { use base64::Engine; String::from_utf8_lossy(&base64::engine::general_purpose::STANDARD.decode(input).unwrap_or_default()).to_string() }
#[op2] #[string] pub fn op_java_md5_encode(#[string] input: String) -> String { format!("{:x}", md5::compute(input.as_bytes())) }

#[op2] #[string] pub fn op_java_aes_base64_decode(#[string] data: String, #[string] key: String) -> String {
    use aes::cipher::KeyIvInit; use base64::Engine; use cbc::Decryptor; use aes::Aes128;
    let decoded = base64::engine::general_purpose::STANDARD.decode(&data).unwrap_or_default();
    let (key_str, iv_str) = if let Some(pos) = key.find("::") { (&key[..pos], &key[pos+2..]) } else { (key.as_str(), "") };
    let key_bytes = key_str.as_bytes(); let mut key_arr = [0u8; 16]; let len = key_bytes.len().min(16); key_arr[..len].copy_from_slice(&key_bytes[..len]);
    let iv_bytes = iv_str.as_bytes(); let mut iv_arr = [0u8; 16]; let iv_len = iv_bytes.len().min(16); iv_arr[..iv_len].copy_from_slice(&iv_bytes[..iv_len]);
    let cipher = <Decryptor<Aes128> as KeyIvInit>::new(&key_arr.into(), &iv_arr.into());
    let mut buf = decoded; cipher.decrypt_padded_mut::<aes::cipher::block_padding::Pkcs7>(&mut buf).ok();
    String::from_utf8_lossy(&buf).trim_end_matches(|c: char| c == '\0' || c.is_ascii_control()).to_string()
}

static STORAGE: std::sync::LazyLock<parking_lot::Mutex<HashMap<String, HashMap<String, String>>>> = std::sync::LazyLock::new(|| parking_lot::Mutex::new(HashMap::new()));
#[op2] #[string] pub fn op_java_put(#[string] source_key: String, #[string] key: String, #[string] value: String) -> String { STORAGE.lock().entry(source_key).or_default().insert(key, value); "true".into() }
#[op2] #[string] pub fn op_java_get(#[string] source_key: String, #[string] key: String) -> String { STORAGE.lock().get(&source_key).and_then(|m| m.get(&key)).cloned().unwrap_or_default() }

static COOKIE_STORE: std::sync::LazyLock<parking_lot::Mutex<HashMap<String, HashMap<String, String>>>> = std::sync::LazyLock::new(|| parking_lot::Mutex::new(HashMap::new()));
#[op2] #[string] pub fn op_java_get_cookie(#[string] url: String, #[string] key: String) -> String {
    let store = COOKIE_STORE.lock();
    if let Some(cookies) = store.get(&url) {
        if key.is_empty() {
            let mut result = cookies.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("; ");
            while result.len() > 4096 { if let Some(first_key) = cookies.keys().next().cloned() { let val = cookies.get(&first_key).cloned().unwrap_or_default(); result = result.replace(&format!("{}={}", first_key, val), "").replace("; ;", ";").trim_matches(';').to_string(); } else { break; } }
            return result;
        }
        return cookies.get(&key).cloned().unwrap_or_default();
    }
    String::new()
}
#[op2(fast)] pub fn op_java_set_cookie(#[string] url: String, #[string] cookie_str: String) {
    let mut store = COOKIE_STORE.lock(); let cookies = store.entry(url).or_default();
    for part in cookie_str.split(';') { let t = part.trim(); if let Some(eq) = t.find('=') { let k = t[..eq].trim().to_string(); let v = t[eq+1..].trim().to_string(); if !k.is_empty() { cookies.insert(k, v); } } }
}

static COOKIE_SAVE_PATH: OnceLock<PathBuf> = OnceLock::new();
pub fn set_cookie_save_dir(dir: PathBuf) { let _ = COOKIE_SAVE_PATH.set(dir); }
pub fn get_cookies_json() -> String { let store = COOKIE_STORE.lock(); serde_json::to_string(&*store).unwrap_or_else(|_| "{}".into()) }
pub fn load_cookies_from_file() -> String {
    if let Some(dir) = COOKIE_SAVE_PATH.get() { let path = dir.join("cookies.json"); if let Ok(content) = std::fs::read_to_string(&path) { if let Ok(parsed) = serde_json::from_str::<HashMap<String, HashMap<String, String>>>(&content) { let mut store = COOKIE_STORE.lock(); *store = parsed; return "ok".into(); } } }
    "no saved cookies".into()
}

#[op2(fast)] pub fn op_java_emit_log(#[string] level: String, #[string] msg: String) { emit_log(&level, &msg); }
#[op2(fast)] pub fn op_java_start_browser(#[string] url: String) { let _ = open::that(&url); }
#[op2] #[string] pub fn op_java_time_format(#[bigint] timestamp: i64) -> String { let ts_sec = if timestamp > 9999999999 { timestamp / 1000 } else { timestamp }; chrono::DateTime::from_timestamp(ts_sec, 0).map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()).unwrap_or_default() }
#[op2] #[string] pub fn op_java_encode_uri(#[string] input: String) -> String { urlencoding::encode(&input).to_string() }
#[op2] #[string] pub fn op_java_decode_uri(#[string] input: String) -> String { urlencoding::decode(&input).unwrap_or(std::borrow::Cow::Borrowed(&input)).to_string() }
#[op2] #[string] pub fn op_java_t2s(#[string] text: String) -> String { hanconv::t2s(&text) }
#[op2] #[string] pub fn op_java_s2t(#[string] text: String) -> String { hanconv::s2t(&text) }
#[op2] #[string] pub fn op_java_random_uuid() -> String { uuid::Uuid::new_v4().to_string() }
#[op2(fast)] pub fn op_java_copy_text(#[string] text: String) { use arboard::Clipboard; if let Ok(mut clipboard) = Clipboard::new() { let _ = clipboard.set_text(&text); } }
#[op2] #[string] pub fn op_java_start_browser_await(#[string] url: String, #[string] _title: String) -> String { let _ = open::that(&url); String::new() }
#[op2] #[string] pub fn op_java_login_complete(#[string] url: String, #[string] cookie_str: String) -> String { let mut store = COOKIE_STORE.lock(); let cookies = store.entry(url.clone()).or_default(); for part in cookie_str.split(';') { let t = part.trim(); if let Some(eq) = t.find('=') { let k = t[..eq].trim().to_string(); let v = t[eq+1..].trim().to_string(); if !k.is_empty() { cookies.insert(k, v); } } } format!("ok, saved {} cookies", url) }
#[op2] #[string] pub fn op_java_get_verification_code(#[string] svg: String) -> String { svg }
#[op2] #[string] pub fn op_java_show_photo(#[string] src: String) -> String { src }
#[op2] #[string] pub fn op_java_open_video_player(#[string] url: String, #[string] title: String) -> String { let _ = open::that(&url); title }
#[op2] #[string] pub fn op_java_download_file(#[string] url: String) -> String { let dir = get_cache_dir(); std::fs::create_dir_all(&dir).ok(); let hash = format!("{:x}", md5::compute(url.as_bytes())); let file_path = dir.join(&hash); let (reply_tx, reply_rx): (SyncSender<AjaxResponse>, Receiver<AjaxResponse>) = sync_channel(1); if AJAX_TX.send(((url.clone(), None, None, None), reply_tx)).is_ok() { if let Ok(Ok(text)) = reply_rx.recv_timeout(std::time::Duration::from_secs(60)) { let _ = std::fs::write(&file_path, &text); return text; } } String::new() }
#[op2(fast)] pub fn op_java_up_login_data(#[string] _info: String) {}
#[op2(fast)] pub fn op_java_refresh_explore() {}
#[op2(fast)] pub fn op_java_refresh_book_info() {}
#[op2] #[string] pub fn op_java_search_book(#[string] keyword: String, #[string] _source_json: String) -> String { keyword }

static LIB_CACHE_DIR: OnceLock<PathBuf> = OnceLock::new();
pub fn set_lib_cache_dir(dir: PathBuf) { let _ = LIB_CACHE_DIR.set(dir); }
fn get_cache_dir() -> PathBuf { LIB_CACHE_DIR.get().cloned().unwrap_or_else(|| std::env::temp_dir().join("abyss_lib_cache")) }

#[op2] #[string] pub fn op_java_cache_file(#[string] url: String) -> String {
    let dir = get_cache_dir(); std::fs::create_dir_all(&dir).ok();
    let hash = format!("{:x}", md5::compute(url.as_bytes())); let file_path = dir.join(&hash);
    if file_path.exists() { if let Ok(content) = std::fs::read_to_string(&file_path) { return content; } }
    let (reply_tx, reply_rx): (SyncSender<AjaxResponse>, Receiver<AjaxResponse>) = sync_channel(1);
    if AJAX_TX.send(((url.clone(), None, None, None), reply_tx)).is_ok() {
        if let Ok(Ok(text)) = reply_rx.recv_timeout(std::time::Duration::from_secs(30)) {
            let _ = std::fs::write(&file_path, &text);
            return text;
        }
    }
    String::new()
}

#[op2] #[string] pub fn op_java_save_cookies() -> String { let store = COOKIE_STORE.lock(); match serde_json::to_string(&*store) { Ok(json) => { if let Some(dir) = COOKIE_SAVE_PATH.get() { let _ = std::fs::write(dir.join("cookies.json"), &json); } json } Err(e) => format!("error: {}", e) } }
#[op2] #[string] pub fn op_java_load_cookies() -> String { load_cookies_from_file() }

// ============================================
// RSA
// ============================================
use rsa::{RsaPrivateKey, RsaPublicKey, Pkcs1v15Encrypt};
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};

static RSA_KEY_STORE: LazyLock<parking_lot::Mutex<HashMap<String, (Option<RsaPrivateKey>, Option<RsaPublicKey>)>>> = LazyLock::new(|| parking_lot::Mutex::new(HashMap::new()));

#[op2] #[string] pub fn op_java_rsa_set_public_key(#[string] source: String, #[string] key: String) -> String {
    let clean = key.trim();
    let der = if clean.starts_with("-----") {
        match RsaPublicKey::from_public_key_pem(clean) { Ok(k) => k, Err(e) => return format!("error: {}", e) }
    } else {
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, clean) {
            Ok(der_bytes) => match RsaPublicKey::from_public_key_der(&der_bytes) { Ok(k) => k, Err(e) => return format!("error: {}", e) },
            Err(e) => return format!("error: base64 decode: {}", e)
        }
    };
    let mut store = RSA_KEY_STORE.lock();
    let entry = store.entry(source).or_insert((None, None));
    entry.1 = Some(der);
    "ok".into()
}

#[op2] #[string] pub fn op_java_rsa_set_private_key(#[string] source: String, #[string] key: String) -> String {
    let clean = key.trim();
    let der = if clean.starts_with("-----") {
        match RsaPrivateKey::from_pkcs8_pem(clean) { Ok(k) => k, Err(e) => return format!("error: {}", e) }
    } else {
        match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, clean) {
            Ok(der_bytes) => match RsaPrivateKey::from_pkcs8_der(&der_bytes) { Ok(k) => k, Err(e) => return format!("error: {}", e) },
            Err(e) => return format!("error: base64 decode: {}", e)
        }
    };
    let mut store = RSA_KEY_STORE.lock();
    let entry = store.entry(source).or_insert((None, None));
    entry.0 = Some(der);
    "ok".into()
}

#[op2] #[string] pub fn op_java_rsa_encrypt(#[string] source: String, #[string] data: String) -> String {
    let store = RSA_KEY_STORE.lock();
    let entry = match store.get(&source) { Some(e) => e, None => return "error: no key set".into() };
    let pub_key = match &entry.1 { Some(k) => k, None => return "error: no public key".into() };
    let mut rng = rand::thread_rng();
    match pub_key.encrypt(&mut rng, Pkcs1v15Encrypt, data.as_bytes()) {
        Ok(encrypted) => base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &encrypted),
        Err(e) => format!("error: {}", e)
    }
}

#[op2] #[string] pub fn op_java_rsa_decrypt(#[string] source: String, #[string] data: String) -> String {
    let store = RSA_KEY_STORE.lock();
    let entry = match store.get(&source) { Some(e) => e, None => return "error: no key set".into() };
    let priv_key = match &entry.0 { Some(k) => k, None => return "error: no private key".into() };
    let decoded = match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data) {
        Ok(d) => d, Err(e) => return format!("error: base64 decode: {}", e)
    };
    match priv_key.decrypt(Pkcs1v15Encrypt, &decoded) {
        Ok(decrypted) => String::from_utf8_lossy(&decrypted).to_string(),
        Err(e) => format!("error: {}", e)
    }
}
