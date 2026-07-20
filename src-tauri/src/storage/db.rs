use crate::error::{AbyssError, Result};
use rusqlite::Connection;
use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use serde_json::Value;

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn init_db(db_path: &str) -> Result<()> {
    let conn = Connection::open(db_path).map_err(|e| AbyssError::DbError(e.to_string()))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_kv_store_key ON kv_store(key)",
        [],
    )?;

    DB.set(Mutex::new(conn)).map_err(|_| AbyssError::DbError("DB already initialized".into()))?;
    Ok(())
}

fn get_conn() -> Result<parking_lot::MutexGuard<'static, Connection>> {
    Ok(DB.get()
        .ok_or_else(|| AbyssError::DbError("DB not initialized".into()))?
        .lock())
}

// ─── Store ───
pub fn store_get(key: &str) -> Result<Option<String>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT value FROM kv_store WHERE key = ?")?;
    let mut rows = stmt.query(rusqlite::params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn store_set(key: &str, value: &str) -> Result<()> {
    let conn = get_conn()?;
    conn.execute(
        "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

pub fn store_delete(key: &str) -> Result<()> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM kv_store WHERE key = ?", rusqlite::params![key])?;
    Ok(())
}

pub fn store_get_all() -> Result<Vec<(String, String)>> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT key, value FROM kv_store")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

// ─── 书源 ───
pub fn load_book_sources() -> Result<Vec<Value>> {
    let raw = store_get("bookSource")?.unwrap_or_else(|| "[]".into());
    let sources: Vec<Value> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(sources)
}

pub fn save_book_sources(sources: &[Value]) -> Result<()> {
    let json = serde_json::to_string(sources)?;
    store_set("bookSource", &json)
}

// ─── 书架 ───
pub fn load_bookshelf() -> Result<Vec<Value>> {
    let raw = store_get("bookshelf")?.unwrap_or_else(|| "[]".into());
    let books: Vec<Value> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(books)
}

pub fn save_bookshelf(books: &[Value]) -> Result<()> {
    let json = serde_json::to_string(books)?;
    store_set("bookshelf", &json)
}

// ─── 阅读进度 ───
pub fn load_reading_progress() -> Result<Value> {
    let raw = store_get("readingProgress")?.unwrap_or_else(|| "{}".into());
    let progress: Value = serde_json::from_str(&raw).unwrap_or_default();
    Ok(progress)
}

pub fn save_reading_progress(progress: &Value) -> Result<()> {
    store_set("readingProgress", &serde_json::to_string(progress)?)
}
