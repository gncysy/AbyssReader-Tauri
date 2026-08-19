use deno_core::op2;
use std::collections::HashMap;
use std::sync::LazyLock;
use parking_lot::Mutex;

struct RateLimitRecord {
    time: i64,
    access_limit: i32,
    interval: i64,
    frequency: i32,
}

static RATE_LIMITER: LazyLock<Mutex<HashMap<String, Mutex<RateLimitRecord>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const RATE_LIMIT_PER_SECOND: i32 = 3;
const DEFAULT_RATE_INTERVAL: i64 = 1000;

fn is_blocked_host(hostname: &str) -> bool {
    let blocked = ["127.0.0.1", "localhost", "::1", "0.0.0.0"];
    if blocked.contains(&hostname) {
        return true;
    }
    if let Ok(addr) = hostname.parse::<std::net::Ipv4Addr>() {
        let octets = addr.octets();
        if octets[0] == 127 || octets[0] == 10 {
            return true;
        }
        if octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31 {
            return true;
        }
        if octets[0] == 192 && octets[1] == 168 {
            return true;
        }
        if octets[0] == 169 && octets[1] == 254 {
            return true;
        }
    }
    false
}

fn parse_concurrent_rate(rate: &str) -> Option<(i32, i64)> {
    if rate.is_empty() || rate == "0" {
        return None;
    }
    if let Some(slash_idx) = rate.find('/') {
        let access_limit: i32 = rate[..slash_idx].trim().parse().ok()?;
        let interval: i64 = rate[slash_idx + 1..].trim().parse().ok()?;
        if access_limit <= 0 || interval <= 0 {
            return None;
        }
        Some((access_limit, interval))
    } else {
        let interval: i64 = rate.trim().parse().ok()?;
        if interval <= 0 {
            return None;
        }
        Some((1, interval))
    }
}

fn rate_limit(url: &str, concurrent_rate: Option<&str>) {
    let host = url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "unknown".into());

    let (access_limit, interval) = concurrent_rate
        .and_then(|r| parse_concurrent_rate(r))
        .unwrap_or((RATE_LIMIT_PER_SECOND, DEFAULT_RATE_INTERVAL));

    let mut map = RATE_LIMITER.lock();
    let mutex = map.entry(host.clone()).or_insert_with(|| {
        Mutex::new(RateLimitRecord {
            time: 0,
            access_limit,
            interval,
            frequency: 0,
        })
    });

    {
        let mut record = mutex.lock();
        if record.access_limit != access_limit || record.interval != interval {
            record.access_limit = access_limit;
            record.interval = interval;
        }
    }

    let mut record = mutex.lock();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    let next_time = record.time + record.interval;
    if now >= next_time {
        record.time = now;
        record.frequency = 1;
    } else if record.frequency < record.access_limit {
        record.frequency += 1;
    } else {
        let wait_time = next_time - now;
        drop(record);
        std::thread::sleep(std::time::Duration::from_millis(wait_time as u64));
    }
}

fn clean_url(raw: &str) -> String {
    raw.trim()
        .replace('\n', "")
        .replace('\r', "")
        .replace('\t', "")
}

fn parse_ajax_url(raw: &str) -> (String, Option<String>, Option<HashMap<String, String>>, Option<String>, Option<String>) {
    let raw = clean_url(raw);
    let comma_brace_pos = raw.rfind(",{");
    if let Some(pos) = comma_brace_pos {
        let url = raw[..pos].to_string();
        let rest = &raw[pos + 1..];
        // 修复：还原转义引号 + 清除控制字符 + 为裸键名添加引号
        let fixed = rest
            .replace("\\\"", "\"")
            .replace('\u{200b}', "")
            .replace('\u{200c}', "")
            .replace('\u{200d}', "")
            .replace('\u{feff}', "")
            .replace('\u{2060}', "")
            // 为裸键名添加引号（JS 端拼接 JSON 时可能漏掉引号）
            .replace("{headers:", "{\"headers\":")
            .replace(",headers:", ",\"headers\":")
            .replace("{method:", "{\"method\":")
            .replace(",method:", ",\"method\":")
            .replace("{body:", "{\"body\":")
            .replace(",body:", ",\"body\":")
            .replace("{charset:", "{\"charset\":")
            .replace(",charset:", ",\"charset\":")
            .replace("{webView:", "{\"webView\":")
            .replace(",webView:", ",\"webView\":")
            .replace("{webJs:", "{\"webJs\":")
            .replace(",webJs:", ",\"webJs\":")
            .replace("{dnsIp:", "{\"dnsIp\":")
            .replace(",dnsIp:", ",\"dnsIp\":")
            .replace("{js:", "{\"js\":")
            .replace(",js:", ",\"js\":")
            .replace("{bodyJs:", "{\"bodyJs\":")
            .replace(",bodyJs:", ",\"bodyJs\":")
            .replace("{serverID:", "{\"serverID\":")
            .replace(",serverID:", ",\"serverID\":")
            .replace("{type:", "{\"type\":")
            .replace(",type:", ",\"type\":")
            .replace("{retry:", "{\"retry\":")
            .replace(",retry:", ",\"retry\":")
            .replace("{concurrentRate:", "{\"concurrentRate\":")
            .replace(",concurrentRate:", ",\"concurrentRate\":")
            .replace("{webViewDelayTime:", "{\"webViewDelayTime\":")
            .replace(",webViewDelayTime:", ",\"webViewDelayTime\":");

        let parsed = serde_json::from_str::<serde_json::Value>(&fixed).ok();
        let method = parsed
            .as_ref()
            .and_then(|v| v.get("method").and_then(|m| m.as_str()).map(|s| s.to_uppercase()));
        let headers = parsed
            .as_ref()
            .and_then(|v| v.get("headers").cloned())
            .and_then(|h| serde_json::from_str::<HashMap<String, String>>(&h.to_string()).ok());
        let body = parsed
            .as_ref()
            .and_then(|v| v.get("body").and_then(|b| {
                if b.is_string() {
                    Some(b.as_str().unwrap().to_string())
                } else {
                    Some(b.to_string())
                }
            }));
        let concurrent_rate = parsed
            .as_ref()
            .and_then(|v| v.get("concurrentRate").and_then(|r| r.as_str()).map(|s| s.to_string()));

        // 调试日志
        if let Some(ref h) = headers {
            crate::js_runtime::ops::emit_log(
                "info",
                &format!("[ajax op] 解析 headers 成功: {} 个", h.len()),
            );
        } else {
            crate::js_runtime::ops::emit_log(
                "info",
                &format!("[ajax op] headers 解析失败, fixed: {}, parsed: {:?}", fixed, parsed),
            );
        }

        (url, method, headers, body, concurrent_rate)
    } else {
        (raw.to_string(), None, None, None, None)
    }
}

fn with_blocking_client<F, R>(f: F) -> R
where
    F: FnOnce(&reqwest::blocking::Client) -> R + Send + 'static,
    R: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = std::thread::spawn(move || {
        let client = reqwest::blocking::Client::builder()
            .user_agent(crate::js_runtime::ops::get_ua())
            .danger_accept_invalid_certs(true)
            .redirect(reqwest::redirect::Policy::limited(5))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap();
        let result = f(&client);
        let _ = tx.send(result);
    });

    match rx.recv() {
        Ok(result) => result,
        Err(_) => {
            let _ = handle.join();
            panic!("with_blocking_client: 线程异常退出")
        }
    }
}

#[op2]
#[string]
pub fn op_java_ajax(#[string] url: String) -> String {
    crate::js_runtime::ops::emit_log("info", &format!("[ajax op] 调用: {}", url));

    let (req_url, method, headers, body, concurrent_rate) = parse_ajax_url(&url);

    if let Ok(parsed) = url::Url::parse(&req_url) {
        if let Some(host) = parsed.host_str() {
            if is_blocked_host(host) {
                crate::js_runtime::ops::emit_log("error", &format!("[ajax op] 阻止内网地址: {}", host));
                return serde_json::json!({
                    "body": format!("error: 禁止访问内网地址: {}", host),
                    "url": req_url,
                    "headers": {},
                    "status": 403
                }).to_string();
            }
        }
    }
    if req_url.starts_with("file://") {
        crate::js_runtime::ops::emit_log("error", "[ajax op] 阻止 file:// 协议");
        return serde_json::json!({
            "body": "error: 禁止访问本地文件",
            "url": req_url,
            "headers": {},
            "status": 403
        }).to_string();
    }

    rate_limit(&req_url, concurrent_rate.as_deref());

    let url_clone = req_url.clone();
    let method_clone = method.clone();
    let headers_clone = headers.clone();
    let body_clone = body.clone();

    with_blocking_client(move |client| {
        let mut req = if method_clone.as_deref() == Some("POST") {
            client.post(&url_clone)
        } else {
            client.get(&url_clone)
        };

        if let Some(h) = headers_clone {
            for (k, v) in h {
                req = req.header(k, v);
            }
        }

        if let Some(b) = body_clone {
            req = req.body(b);
        }

        match req.send() {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let final_url = resp.url().to_string();
                let resp_headers: HashMap<String, String> = resp
                    .headers()
                    .iter()
                    .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
                    .collect();
                match resp.text() {
                    Ok(text) => {
                        crate::js_runtime::ops::emit_log(
                            "info",
                            &format!("[ajax op] 成功: {} (HTTP {}, {} 字节)", url_clone, status, text.len()),
                        );
                        serde_json::json!({
                            "body": text,
                            "url": final_url,
                            "headers": resp_headers,
                            "status": status
                        }).to_string()
                    }
                    Err(e) => {
                        crate::js_runtime::ops::emit_log(
                            "error",
                            &format!("[ajax op] 读取响应失败: {} -> {}", url_clone, e),
                        );
                        serde_json::json!({
                            "body": format!("error: {}", e),
                            "url": final_url,
                            "headers": resp_headers,
                            "status": status
                        }).to_string()
                    }
                }
            }
            Err(e) => {
                crate::js_runtime::ops::emit_log(
                    "error",
                    &format!("[ajax op] 请求失败: {} -> {}", url_clone, e),
                );
                serde_json::json!({
                    "body": format!("error: {}", e),
                    "url": url_clone,
                    "headers": {},
                    "status": 0
                }).to_string()
            }
        }
    })
}

static PERSISTENT_WEBJS_WINDOW: LazyLock<Mutex<Option<tauri::WebviewWindow>>> =
    LazyLock::new(|| Mutex::new(None));

#[op2]
#[string]
pub fn op_java_web_js(#[string] html: String, #[string] js: String) -> String {
    use std::sync::mpsc;

    let app_handle = match crate::js_runtime::ops::get_app_handle() {
        Some(h) => h,
        None => return String::new(),
    };

    let window = {
        let mut guard = PERSISTENT_WEBJS_WINDOW.lock();
        if let Some(existing) = guard.as_ref() {
            existing.clone()
        } else {
            let label = format!("webjs_persistent_{}", uuid::Uuid::new_v4());
            let w = tauri::WebviewWindowBuilder::new(
                &app_handle,
                &label,
                tauri::WebviewUrl::App("about:blank".into()),
            )
            .visible(false)
            .title("")
            .build()
            .unwrap();
            crate::js_runtime::ops::emit_log("info", &format!("[webjs] 创建持久 WebView: {}", label));
            *guard = Some(w.clone());
            w
        }
    };

    let (tx, rx) = mpsc::channel();
    let html_clone = html.clone();
    let js_clone = js.clone();
    let window_clone = window.clone();

    let _ = app_handle.run_on_main_thread(move || {
        let _ = window_clone.eval(&format!(
            "document.write({});",
            serde_json::to_string(&html_clone).unwrap()
        ));

        std::thread::sleep(std::time::Duration::from_millis(300));

        let _ = window_clone.eval(&format!(
            "window.name = (function(){{ {} }})();",
            js_clone
        ));

        std::thread::spawn(move || {
            let intervals = [200u64, 400, 600, 800, 1000];
            let max_retries = 30;
            for retry in 0..=max_retries {
                let (tx_inner, rx_inner) = mpsc::channel();
                let w = window_clone.clone();
                let _ = w.eval_with_callback("window.name || ''", move |result| {
                    let _ = tx_inner.send(result);
                });
                if let Ok(result) = rx_inner.recv_timeout(std::time::Duration::from_secs(2)) {
                    if !result.is_empty() && result != "null" {
                        let _ = tx.send(result);
                        return;
                    }
                }
                let delay = if retry < intervals.len() as i32 {
                    intervals[retry as usize]
                } else {
                    intervals[intervals.len() - 1]
                };
                std::thread::sleep(std::time::Duration::from_millis(delay));
            }
            let _ = tx.send(String::new());
        });
    });

    rx.recv_timeout(std::time::Duration::from_secs(25)).unwrap_or_default()
}
