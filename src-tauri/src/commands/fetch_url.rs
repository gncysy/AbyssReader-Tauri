use crate::error::Result;
use crate::network::http::execute_http_request;
use std::collections::HashMap;

#[tauri::command]
pub async fn fetch_url(
    url: String,
    method: Option<String>,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
    charset: Option<String>,
) -> Result<String> {
    execute_http_request(&url, &method.unwrap_or_else(|| "GET".into()), headers, body, charset, 30).await
}
