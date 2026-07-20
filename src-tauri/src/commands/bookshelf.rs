use crate::error::Result;
use crate::storage;
use serde_json::Value;

#[tauri::command]
pub async fn get_bookshelf() -> Result<Vec<Value>> {
    storage::load_bookshelf()
}

#[tauri::command]
pub async fn add_to_bookshelf(book: Value) -> Result<()> {
    let mut books = storage::load_bookshelf()?;
    books.insert(0, book);
    storage::save_bookshelf(&books)
}

#[tauri::command]
pub async fn remove_from_bookshelf(book_url: String) -> Result<()> {
    let books = storage::load_bookshelf()?;
    let filtered: Vec<Value> = books
        .into_iter()
        .filter(|b| b.get("bookUrl").and_then(|v| v.as_str()) != Some(&book_url))
        .collect();
    storage::save_bookshelf(&filtered)
}

#[tauri::command]
pub async fn update_reading_progress(
    book_url: String,
    chapter_id: i64,
    chapter_title: String,
    scroll_percent: f64,
) -> Result<()> {
    let mut progress = storage::load_reading_progress()?;
    let entry = serde_json::json!({
        "bookUrl": book_url,
        "chapterId": chapter_id,
        "chapterTitle": chapter_title,
        "scrollPercent": scroll_percent,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
    });
    if let Some(obj) = progress.as_object_mut() {
        obj.insert(book_url.clone(), entry);
    }
    storage::save_reading_progress(&progress)
}

#[tauri::command]
pub async fn get_reading_progress(book_url: String) -> Result<Option<Value>> {
    let progress = storage::load_reading_progress()?;
    Ok(progress.get(&book_url).cloned())
}
