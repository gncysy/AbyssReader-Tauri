use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: i64,
    pub name: String,
    pub author: String,
    pub book_url: String,
    pub cover_url: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub toc_url: Option<String>,
    pub origin: Option<String>,
    pub origin_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSource {
    pub book_source_name: String,
    pub book_source_url: String,
    pub book_source_group: Option<String>,
    pub book_source_comment: Option<String>,
    pub search_url: Option<String>,
    pub rule_search: Option<String>,
    pub rule_book_info: Option<String>,
    pub rule_toc: Option<String>,
    pub rule_content: Option<String>,
    pub rule_explore: Option<String>,
    pub explore_url: Option<String>,
    pub header: Option<String>,
    pub enabled: bool,
    pub enabled_cookie_jar: Option<bool>,
    pub weight: Option<i32>,
    pub js_lib: Option<String>,
    pub login_url: Option<String>,
    pub login_ui: Option<String>,
    pub respond_time: Option<i64>,
    pub last_update_time: Option<i64>,
    pub book_url_pattern: Option<String>,
    pub code: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub book_url: String,
    pub chapter_id: i64,
    pub chapter_title: String,
    pub scroll_percent: f64,
    pub updated_at: String,
}
