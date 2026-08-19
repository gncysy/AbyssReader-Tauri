use serde::Serialize;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, AbyssError>;

#[derive(Error, Debug, Serialize)]
pub enum AbyssError {
    #[error("网络请求失败: {0}")]
    NetworkError(String),

    #[error("书源解析错误: {0}")]
    ParseError(String),

    #[error("JS执行错误: {0}")]
    JsError(String),

    #[error("数据库错误: {0}")]
    DbError(String),

    #[error("序列化错误: {0}")]
    SerializationError(String),

    #[error("IO错误: {0}")]
    IoError(String),

    #[error("书源未找到: {0}")]
    SourceNotFound(String),

    #[error("书籍未找到: {0}")]
    BookNotFound(String),

    #[error("章节未找到: {0}")]
    ChapterNotFound(String),

    #[error("配置错误: {0}")]
    ConfigError(String),

    #[error("WebView错误: {0}")]
    WebViewError(String),

    #[error("代理错误: {0}")]
    ProxyError(String),
}

impl From<reqwest::Error> for AbyssError {
    fn from(err: reqwest::Error) -> Self { AbyssError::NetworkError(err.to_string()) }
}

impl From<rusqlite::Error> for AbyssError {
    fn from(err: rusqlite::Error) -> Self { AbyssError::DbError(err.to_string()) }
}

impl From<serde_json::Error> for AbyssError {
    fn from(err: serde_json::Error) -> Self { AbyssError::SerializationError(err.to_string()) }
}

impl From<std::io::Error> for AbyssError {
    fn from(err: std::io::Error) -> Self { AbyssError::IoError(err.to_string()) }
}

impl From<tauri::Error> for AbyssError {
    fn from(err: tauri::Error) -> Self { AbyssError::WebViewError(err.to_string()) }
}

impl From<url::ParseError> for AbyssError {
    fn from(err: url::ParseError) -> Self { AbyssError::ConfigError(format!("URL解析失败: {}", err)) }
}
