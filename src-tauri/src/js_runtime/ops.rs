use deno_core::op2;
use std::collections::HashMap;
use aes::cipher::BlockDecryptMut;

// ─── AJAX ───
#[op2(async)]
#[string]
pub async fn op_java_ajax(#[string] url: String) -> Result<String, anyhow::Error> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .danger_accept_invalid_certs(true)
        .build()?;
    let resp = client.get(&url).send().await?;
    Ok(resp.text().await?)
}

// ─── Jsoup ───
#[op2(async)]
#[serde]
pub async fn op_jsoup_parse(#[string] html: String) -> Result<serde_json::Value, anyhow::Error> {
    Ok(serde_json::json!({ "html": html, "parsed": true }))
}

// ─── Base64 ───
#[op2]
#[string]
pub fn op_java_base64_encode(#[string] input: String) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(input.as_bytes())
}

#[op2]
#[string]
pub fn op_java_base64_decode(#[string] input: String) -> String {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(input).unwrap_or_default();
    String::from_utf8_lossy(&bytes).to_string()
}

// ─── MD5 ───
#[op2]
#[string]
pub fn op_java_md5_encode(#[string] input: String) -> String {
    format!("{:x}", md5::compute(input.as_bytes()))
}

// ─── AES ───
#[op2]
#[string]
pub fn op_java_aes_base64_decode(#[string] data: String, #[string] key: String) -> String {
    use aes::cipher::KeyIvInit;
    use base64::Engine;
    use cbc::Decryptor;
    use aes::Aes128;

    let decoded = base64::engine::general_purpose::STANDARD.decode(&data).unwrap_or_default();
    let key_bytes = key.as_bytes();
    let mut key_arr = [0u8; 16];
    let len = key_bytes.len().min(16);
    key_arr[..len].copy_from_slice(&key_bytes[..len]);
    let iv_arr = [0u8; 16];

    let cipher = <Decryptor<Aes128> as KeyIvInit>::new(&key_arr.into(), &iv_arr.into());
    let mut buf = decoded;
    cipher.decrypt_padded_mut::<aes::cipher::block_padding::Pkcs7>(&mut buf).ok();
    String::from_utf8_lossy(&buf).trim_end_matches(|c: char| c == '\0' || c.is_ascii_control()).to_string()
}

// ─── 存储 ───
static STORAGE: std::sync::LazyLock<parking_lot::Mutex<HashMap<String, HashMap<String, String>>>> = 
    std::sync::LazyLock::new(|| parking_lot::Mutex::new(HashMap::new()));

#[op2]
#[string]
pub fn op_java_put(#[string] source_key: String, #[string] key: String, #[string] value: String) -> String {
    STORAGE.lock().entry(source_key).or_default().insert(key, value);
    "true".into()
}

#[op2]
#[string]
pub fn op_java_get(#[string] source_key: String, #[string] key: String) -> String {
    STORAGE.lock().get(&source_key).and_then(|m| m.get(&key)).cloned().unwrap_or_default()
}

// ─── Cookie ───
static COOKIE_STORE: std::sync::LazyLock<parking_lot::Mutex<HashMap<String, HashMap<String, String>>>> = 
    std::sync::LazyLock::new(|| parking_lot::Mutex::new(HashMap::new()));

#[op2]
#[string]
pub fn op_java_get_cookie(#[string] url: String, #[string] key: String) -> String {
    let store = COOKIE_STORE.lock();
    if let Some(cookies) = store.get(&url) {
        if key.is_empty() {
            return cookies.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("; ");
        }
        return cookies.get(&key).cloned().unwrap_or_default();
    }
    String::new()
}

#[op2(fast)]
pub fn op_java_set_cookie(#[string] url: String, #[string] cookie_str: String) {
    let mut store = COOKIE_STORE.lock();
    let cookies = store.entry(url).or_default();
    for part in cookie_str.split(';') {
        let trimmed = part.trim();
        if let Some(eq) = trimmed.find('=') {
            let k = trimmed[..eq].trim().to_string();
            let v = trimmed[eq+1..].trim().to_string();
            if !k.is_empty() { cookies.insert(k, v); }
        }
    }
}

// ─── 打开浏览器 ───
#[op2(fast)]
pub fn op_java_start_browser(#[string] url: String) {
    let _ = open::that(&url);
}

// ─── 时间 ───
#[op2]
#[string]
pub fn op_java_time_format(#[bigint] timestamp: i64) -> String {
    let ts_sec = if timestamp > 9999999999 { timestamp / 1000 } else { timestamp };
    chrono::DateTime::from_timestamp(ts_sec, 0)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_default()
}

// ─── URL 编码 ───
#[op2]
#[string]
pub fn op_java_encode_uri(#[string] input: String) -> String {
    urlencoding::encode(&input).to_string()
}

#[op2]
#[string]
pub fn op_java_decode_uri(#[string] input: String) -> String {
    urlencoding::decode(&input).unwrap_or(std::borrow::Cow::Borrowed(&input)).to_string()
}

// ─── UUID ───
#[op2]
#[string]
pub fn op_java_random_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}
