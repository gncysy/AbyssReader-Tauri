use crate::error::{AbyssError, Result};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::sync::Mutex;
use reqwest::Method;

static CLIENT_CACHE: LazyLock<Mutex<HashMap<String, Client>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn is_blocked_host(hostname: &str) -> bool {
    let blocked = ["127.0.0.1", "localhost", "::1", "0.0.0.0"];
    if blocked.contains(&hostname) {
        return true;
    }
    if let Ok(addr) = hostname.parse::<std::net::Ipv4Addr>() {
        let octets = addr.octets();
        if octets[0] == 127 || octets[0] == 10 { return true; }
        if octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31 { return true; }
        if octets[0] == 192 && octets[1] == 168 { return true; }
        if octets[0] == 169 && octets[1] == 254 { return true; }
    }
    false
}

pub async fn execute_http_request(
    url: &str,
    method: &str,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    charset: Option<String>,
    timeout_secs: u64,
) -> Result<String> {
    let parsed = url::Url::parse(url).map_err(|e| AbyssError::ConfigError(format!("无效 URL: {}", e)))?;
    if let Some(host) = parsed.host_str() {
        if is_blocked_host(host) {
            return Err(AbyssError::ConfigError(format!("禁止访问内网地址: {}", host)));
        }
    }

    let domain = parsed.host_str().unwrap_or("default").to_string();
    let mut cache = CLIENT_CACHE.lock().await;
    let client = if let Some(c) = cache.get(&domain) {
        c.clone()
    } else {
        let c = Client::builder()
            .user_agent(crate::js_runtime::ops::get_ua())
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(timeout_secs))
            .build()
            .unwrap_or_else(|_| Client::new());
        cache.insert(domain.clone(), c.clone());
        c
    };
    drop(cache);

    let method_upper = method.to_uppercase();
    let method_str = method_upper.as_str();

    let mut req = if method_str == "PROPFIND" {
        client.request(Method::from_bytes(b"PROPFIND").unwrap(), url)
    } else {
        match method_str {
            "POST" => client.post(url),
            "PUT" => client.put(url),
            "DELETE" => client.delete(url),
            _ => client.get(url),
        }
    };

    req = req
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8");

    if let Some(h) = &headers {
        for (k, v) in h {
            req = req.header(k, v);
        }
    }

    if let Some(b) = &body {
        req = req.header("Content-Type", "application/x-www-form-urlencoded").body(b.clone());
    }

    let response = req.send().await?;
    let bytes = response.bytes().await?;

    let content = if let Some(charset_name) = &charset {
        let encoding = encoding_rs::Encoding::for_label(charset_name.as_bytes())
            .unwrap_or(encoding_rs::UTF_8);
        let (decoded, _, _) = encoding.decode(&bytes);
        decoded.into_owned()
    } else {
        let preview = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]);
        if preview.to_lowercase().contains("charset=gbk") || preview.to_lowercase().contains("charset=gb2312") {
            let encoding = encoding_rs::Encoding::for_label(b"gbk").unwrap_or(encoding_rs::UTF_8);
            let (decoded, _, _) = encoding.decode(&bytes);
            decoded.into_owned()
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        }
    };

    Ok(content)
}

