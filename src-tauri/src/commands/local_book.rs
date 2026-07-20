use crate::error::Result;
use crate::storage;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub name: String,
    pub author: String,
    pub book_url: String,
    pub chapter_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterInfo {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub index: usize,
}

#[tauri::command]
pub async fn import_txt(
    _app: AppHandle,
    name: String,
    content: String,
) -> Result<ImportResult> {
    if content.trim().is_empty() {
        return Err(crate::error::AbyssError::IoError("内容为空".into()));
    }

    let book_id = format!("local_{}", Utc::now().timestamp_millis());
    let book_url = format!("local://{}", book_id);

    let chapters = extract_chapters(&content);
    let chapter_count = if chapters.is_empty() { 1 } else { chapters.len() };

    let chapters_json = serde_json::to_string(&chapters)?;
    storage::store_set(&format!("local_chapters_{}", book_id), &chapters_json)?;

    // 安全截取简介（按字符边界）
    let intro = content.chars().take(500).collect::<String>();
    let intro = if content.chars().count() > 500 {
        format!("{}...", intro)
    } else {
        intro
    };

    let mut books = storage::load_bookshelf()?;
    let new_book = serde_json::json!({
        "name": name,
        "author": "本地文件",
        "bookUrl": book_url,
        "coverUrl": null,
        "intro": intro,
        "kind": format!("本地TXT · {}章", chapter_count),
        "lastChapter": chapters.last().map(|c| c.title.clone()),
        "tocUrl": null,
        "origin": "",
        "originName": "本地文件",
    });
    books.insert(0, new_book);
    storage::save_bookshelf(&books)?;

    Ok(ImportResult {
        name,
        author: "本地文件".into(),
        book_url,
        chapter_count,
    })
}

#[tauri::command]
pub async fn get_local_book_chapters(book_id: String) -> Result<Vec<ChapterInfo>> {
    let raw = storage::store_get(&format!("local_chapters_{}", book_id))?
        .unwrap_or_else(|| "[]".into());
    let chapters: Vec<ChapterInfo> = serde_json::from_str(&raw)?;
    Ok(chapters)
}

#[tauri::command]
pub async fn get_local_chapter_content(book_id: String, chapter_id: i64) -> Result<String> {
    let raw = storage::store_get(&format!("local_chapters_{}", book_id))?
        .unwrap_or_else(|| "[]".into());
    let chapters: Vec<ChapterInfo> = serde_json::from_str(&raw)?;
    chapters
        .iter()
        .find(|c| c.id == chapter_id)
        .map(|c| c.content.clone())
        .ok_or_else(|| crate::error::AbyssError::ChapterNotFound(format!("{}:{}", book_id, chapter_id)))
}

fn extract_chapters(content: &str) -> Vec<ChapterInfo> {
    let mut chapters = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut current_title = String::from("正文");
    let mut current_content = Vec::new();
    let mut id: i64 = 0;

    let chapter_re = regex::Regex::new(
        r"^(第[零一二三四五六七八九十百千万\d]+[章节卷].*|序章|楔子|尾声|后记|番外|Chapter\s+\d+.*)"
    ).unwrap();

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            current_content.push(String::new());
            continue;
        }
        if chapter_re.is_match(trimmed) && !current_content.iter().all(|s| s.is_empty()) {
            chapters.push(ChapterInfo {
                id,
                title: current_title,
                content: current_content.join("\n").trim().to_string(),
                index: chapters.len(),
            });
            id += 1;
            current_title = trimmed.to_string();
            current_content.clear();
        } else {
            current_content.push(line.to_string());
        }
    }
    if !current_content.iter().all(|s| s.is_empty()) || !current_title.is_empty() {
        chapters.push(ChapterInfo {
            id,
            title: current_title,
            content: current_content.join("\n").trim().to_string(),
            index: chapters.len(),
        });
    }
    if chapters.is_empty() {
        chapters.push(ChapterInfo {
            id: 0,
            title: "正文".into(),
            content: content.to_string(),
            index: 0,
        });
    }
    chapters
}
