use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: i64, pub name: String, pub author: String, pub book_url: String,
    pub cover_url: Option<String>, pub intro: Option<String>, pub kind: Option<String>,
    pub last_chapter: Option<String>, pub toc_url: Option<String>,
    pub origin: Option<String>, pub origin_name: Option<String>,
    pub created_at: String, pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub book_url: String, pub chapter_id: i64, pub chapter_title: String,
    pub scroll_percent: f64, pub updated_at: String,
}
