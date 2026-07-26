use crate::error::Result;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::SystemTime;

static CACHE_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init_cache_dir(base: &PathBuf) -> PathBuf {
    let cache_dir = base.join("cache");
    fs::create_dir_all(&cache_dir).ok();
    CACHE_DIR.set(cache_dir.clone()).ok();
    cache_dir
}

pub fn get_cache_dir() -> PathBuf {
    CACHE_DIR.get().cloned().unwrap_or_else(|| std::env::temp_dir().join("abyss_cache"))
}

pub fn set_cache_dir(new_dir: &PathBuf) -> Result<()> {
    let old_dir = get_cache_dir();
    if old_dir == *new_dir { return Ok(()); }
    fs::create_dir_all(new_dir)?;
    if old_dir.exists() {
        if let Ok(entries) = fs::read_dir(&old_dir) {
            for entry in entries.flatten() {
                let dest = new_dir.join(entry.file_name());
                fs::rename(entry.path(), &dest).ok();
            }
        }
    }
    CACHE_DIR.set(new_dir.clone()).ok();
    Ok(())
}

#[derive(Clone, Copy)]
pub enum CacheCategory { Cover, Toc, Content, Comic }

impl CacheCategory {
    pub fn dir_name(&self) -> &str {
        match self { CacheCategory::Cover => "covers", CacheCategory::Toc => "toc", CacheCategory::Content => "content", CacheCategory::Comic => "comic" }
    }
    fn limits(&self) -> (usize, u64) {
        match self {
            CacheCategory::Cover => (300, 50 * 1024 * 1024),
            CacheCategory::Toc => (200, 20 * 1024 * 1024),
            CacheCategory::Content => (200, 50 * 1024 * 1024),
            CacheCategory::Comic => (1000, 150 * 1024 * 1024),
        }
    }
}

pub fn get_category_dir(category: CacheCategory) -> PathBuf {
    let dir = get_cache_dir().join(category.dir_name());
    fs::create_dir_all(&dir).ok();
    dir
}

pub fn cache_key(url: &str) -> String {
    format!("{:x}", md5::compute(url.as_bytes()))
}

pub fn cache_put(category: CacheCategory, url: &str, data: &[u8]) -> Result<PathBuf> {
    let dir = get_category_dir(category);
    let key = cache_key(url);
    let path = dir.join(&key);
    fs::write(&path, data)?;
    enforce_limits(category);
    enforce_total_limit();
    Ok(path)
}

pub fn cache_get(category: CacheCategory, url: &str) -> Option<Vec<u8>> {
    let dir = get_category_dir(category);
    let key = cache_key(url);
    let path = dir.join(&key);
    if path.exists() {
        let _ = fs::File::open(&path).and_then(|f| f.set_modified(SystemTime::now()));
        fs::read(&path).ok()
    } else { None }
}

pub fn cache_exists(category: CacheCategory, url: &str, max_age_secs: u64) -> bool {
    let dir = get_category_dir(category);
    let key = cache_key(url);
    let path = dir.join(&key);
    if !path.exists() { return false; }
    if max_age_secs == 0 { return true; }
    if let Ok(meta) = path.metadata() {
        if let Ok(modified) = meta.modified() {
            if let Ok(elapsed) = modified.elapsed() { return elapsed.as_secs() < max_age_secs; }
        }
    }
    false
}

pub fn cache_delete(category: CacheCategory, url: &str) -> Result<()> {
    let dir = get_category_dir(category);
    let key = cache_key(url);
    let path = dir.join(&key);
    if path.exists() { fs::remove_file(&path)?; }
    Ok(())
}

pub fn cache_clear_category(category: CacheCategory) -> Result<usize> {
    let dir = get_category_dir(category);
    let count = fs::read_dir(&dir)?.count();
    if dir.exists() { fs::remove_dir_all(&dir)?; fs::create_dir_all(&dir)?; }
    Ok(count)
}

pub fn cache_clear_all() -> Result<usize> {
    let dir = get_cache_dir();
    let count = count_files_recursive(&dir);
    if dir.exists() { fs::remove_dir_all(&dir)?; fs::create_dir_all(&dir)?; }
    Ok(count)
}

fn enforce_limits(category: CacheCategory) {
    let dir = get_category_dir(category);
    let (max_files, max_bytes) = category.limits();
    let mut files: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Ok(meta) = path.metadata() {
                files.push((path, meta.modified().unwrap_or(SystemTime::now()), meta.len()));
            }
        }
    }
    files.sort_by_key(|(_, t, _)| *t);
    let mut total_size: u64 = files.iter().map(|(_, _, s)| s).sum();
    let mut removed = 0;
    while files.len() - removed > max_files {
        total_size -= files[removed].2;
        fs::remove_file(&files[removed].0).ok();
        removed += 1;
    }
    while total_size > max_bytes && removed < files.len() {
        total_size -= files[removed].2;
        fs::remove_file(&files[removed].0).ok();
        removed += 1;
    }
}

fn enforce_total_limit() {
    let total = total_cache_size();
    let max_total = get_total_limit();
    if total <= max_total { return; }
    let mut all_files: Vec<(PathBuf, SystemTime, u64)> = Vec::new();
    for cat in &[CacheCategory::Cover, CacheCategory::Toc, CacheCategory::Content, CacheCategory::Comic] {
        let dir = get_category_dir(*cat);
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(meta) = path.metadata() {
                    all_files.push((path, meta.modified().unwrap_or(SystemTime::now()), meta.len()));
                }
            }
        }
    }
    all_files.sort_by_key(|(_, t, _)| *t);
    let mut current = total;
    for (path, _, size) in &all_files {
        if current <= max_total { break; }
        if path.exists() { fs::remove_file(path).ok(); current -= size; }
    }
}

fn total_cache_size() -> u64 {
    let mut total = 0;
    for cat in &[CacheCategory::Cover, CacheCategory::Toc, CacheCategory::Content, CacheCategory::Comic] {
        total += dir_size(&get_category_dir(*cat));
    }
    total
}

fn get_total_limit() -> u64 {
    if let Ok(Some(raw)) = crate::storage::db::store_get("cacheConfig") {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(limit) = config.get("maxTotalBytes").and_then(|v| v.as_u64()) { return limit; }
        }
    }
    200 * 1024 * 1024
}

fn count_files_recursive(path: &PathBuf) -> usize {
    if let Ok(entries) = fs::read_dir(path) { entries.filter_map(|e| e.ok()).map(|e| if e.path().is_dir() { count_files_recursive(&e.path()) } else { 1 }).sum() } else { 0 }
}

pub fn cache_size() -> u64 { dir_size(&get_cache_dir()) }

pub fn cache_size_by_category() -> Vec<(String, u64, usize)> {
    let cats = [(CacheCategory::Cover, "封面"), (CacheCategory::Toc, "目录"), (CacheCategory::Content, "正文"), (CacheCategory::Comic, "漫画")];
    cats.iter().map(|(cat, name)| {
        let dir = get_category_dir(*cat);
        (name.to_string(), dir_size(&dir), fs::read_dir(&dir).map(|d| d.count()).unwrap_or(0))
    }).collect()
}

fn dir_size(path: &PathBuf) -> u64 {
    if let Ok(entries) = fs::read_dir(path) { entries.filter_map(|e| e.ok()).map(|e| if e.path().is_dir() { dir_size(&e.path()) } else { e.metadata().map(|m| m.len()).unwrap_or(0) }).sum() } else { 0 }
}
