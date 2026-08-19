use crate::error::Result;
use crate::storage::db;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, Instant};
use std::sync::LazyLock;
use parking_lot::Mutex;

static CACHE_ROOT: OnceLock<PathBuf> = OnceLock::new();
const CACHE_PATH_DB_KEY: &str = "cache_path";
static LAST_ENFORCE: LazyLock<Mutex<Instant>> = LazyLock::new(|| Mutex::new(Instant::now()));
static PUT_COUNTER: LazyLock<Mutex<u32>> = LazyLock::new(|| Mutex::new(0));

const ENFORCE_EVERY_PUTS: u32 = 10;
const ENFORCE_INTERVAL_SECS: u64 = 30;
const MAX_DIR_DEPTH: usize = 3;

pub fn init_cache_dir(app_data_dir: &PathBuf) -> PathBuf {
    let root = if let Ok(Some(saved)) = db::store_get(CACHE_PATH_DB_KEY) {
        let saved_path = PathBuf::from(&saved);
        if saved_path.exists() || fs::create_dir_all(&saved_path).is_ok() {
            saved_path
        } else {
            let default = app_data_dir.join("cache");
            let _ = db::store_delete(CACHE_PATH_DB_KEY);
            default
        }
    } else {
        app_data_dir.join("cache")
    };
    fs::create_dir_all(&root).ok();
    for cat in CacheCategory::all() {
        fs::create_dir_all(root.join(cat.dir_name())).ok();
    }
    CACHE_ROOT.set(root.clone()).ok();
    root
}

pub fn get_cache_root() -> PathBuf {
    CACHE_ROOT
        .get()
        .cloned()
        .unwrap_or_else(|| std::env::temp_dir().join("abyss_cache"))
}

pub fn set_cache_dir(new_root: &PathBuf) -> Result<()> {
    let old_root = get_cache_root();
    if old_root == *new_root {
        return Ok(());
    }
    fs::create_dir_all(new_root)?;
    for cat in CacheCategory::all() {
        let old_dir = old_root.join(cat.dir_name());
        let new_dir = new_root.join(cat.dir_name());
        if old_dir.exists() {
            fs::create_dir_all(&new_dir).ok();
            move_dir_content(&old_dir, &new_dir);
        }
    }
    db::store_set(CACHE_PATH_DB_KEY, &new_root.to_string_lossy())?;
    CACHE_ROOT.set(new_root.clone()).ok();
    Ok(())
}

fn move_dir_content(from: &PathBuf, to: &PathBuf) {
    fs::create_dir_all(to).ok();
    if let Ok(entries) = fs::read_dir(from) {
        for entry in entries.flatten() {
            let dest = to.join(entry.file_name());
            if fs::rename(entry.path(), &dest).is_err() {
                if entry.path().is_dir() {
                    copy_dir_recursive(&entry.path(), &dest);
                    let _ = fs::remove_dir_all(entry.path());
                } else if let Ok(data) = fs::read(entry.path()) {
                    if fs::write(&dest, &data).is_ok() {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
    if from.exists() && fs::read_dir(from).map(|d| d.count()).unwrap_or(0) == 0 {
        let _ = fs::remove_dir_all(from);
    }
}

fn copy_dir_recursive(from: &PathBuf, to: &PathBuf) {
    fs::create_dir_all(to).ok();
    if let Ok(entries) = fs::read_dir(from) {
        for entry in entries.flatten() {
            let dest = to.join(entry.file_name());
            if entry.path().is_dir() {
                copy_dir_recursive(&entry.path(), &dest);
            } else if let Ok(data) = fs::read(entry.path()) {
                let _ = fs::write(&dest, &data);
            }
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum CacheCategory {
    Cover,
    Toc,
    Content,
    Comic,
    Image,
    Lib,
}

impl CacheCategory {
    pub fn all() -> &'static [CacheCategory] {
        &[
            CacheCategory::Cover,
            CacheCategory::Toc,
            CacheCategory::Content,
            CacheCategory::Comic,
            CacheCategory::Image,
            CacheCategory::Lib,
        ]
    }
    pub fn dir_name(&self) -> &str {
        match self {
            CacheCategory::Cover => "covers",
            CacheCategory::Toc => "toc",
            CacheCategory::Content => "contents",
            CacheCategory::Comic => "comics",
            CacheCategory::Image => "images",
            CacheCategory::Lib => "libs",
        }
    }
    pub fn display_name(&self) -> &str {
        match self {
            CacheCategory::Cover => "封面缓存",
            CacheCategory::Toc => "目录缓存",
            CacheCategory::Content => "正文缓存",
            CacheCategory::Comic => "漫画缓存",
            CacheCategory::Image => "图片缓存",
            CacheCategory::Lib => "JS库缓存",
        }
    }
    fn limits(&self) -> (usize, u64) {
        match self {
            CacheCategory::Cover => (300, 50 * 1024 * 1024),
            CacheCategory::Toc => (200, 20 * 1024 * 1024),
            CacheCategory::Content => (200, 50 * 1024 * 1024),
            CacheCategory::Comic => (1000, 150 * 1024 * 1024),
            CacheCategory::Image => (500, 100 * 1024 * 1024),
            CacheCategory::Lib => (50, 30 * 1024 * 1024),
        }
    }
    fn ttl_secs(&self) -> u64 {
        match self {
            CacheCategory::Cover => 30 * 24 * 3600,
            CacheCategory::Toc => 3 * 24 * 3600,
            CacheCategory::Content => 7 * 24 * 3600,
            CacheCategory::Comic => 7 * 24 * 3600,
            CacheCategory::Image => 7 * 24 * 3600,
            CacheCategory::Lib => 0,
        }
    }
}

pub fn get_category_dir(cat: CacheCategory) -> PathBuf {
    get_cache_root().join(cat.dir_name())
}

pub fn cache_key(url: &str) -> String {
    format!("{:x}", md5::compute(url.as_bytes()))
}

pub fn cache_put(cat: CacheCategory, url: &str, data: &[u8]) -> Result<PathBuf> {
    let dir = get_category_dir(cat);
    let key = cache_key(url);
    let path = dir.join(&key);
    fs::write(&path, data)?;

    let mut counter = PUT_COUNTER.lock();
    *counter += 1;
    if *counter >= ENFORCE_EVERY_PUTS {
        *counter = 0;
        drop(counter);
        enforce_limits(cat);
        enforce_total_limit();
    } else {
        let mut last = LAST_ENFORCE.lock();
        if last.elapsed().as_secs() >= ENFORCE_INTERVAL_SECS {
            *last = Instant::now();
            drop(last);
            enforce_limits(cat);
            enforce_total_limit();
        }
    }
    Ok(path)
}

pub fn cache_get(cat: CacheCategory, url: &str) -> Option<Vec<u8>> {
    let dir = get_category_dir(cat);
    let key = cache_key(url);
    let path = dir.join(&key);
    if !path.exists() {
        return None;
    }
    let ttl = cat.ttl_secs();
    if ttl > 0 {
        if let Ok(meta) = path.metadata() {
            if let Ok(modified) = meta.modified() {
                if let Ok(elapsed) = modified.elapsed() {
                    if elapsed.as_secs() > ttl {
                        fs::remove_file(&path).ok();
                        return None;
                    }
                }
            }
        }
    }
    // 更新访问时间（用于 LRU 淘汰）
    let _ = fs::File::open(&path).and_then(|f| f.set_modified(SystemTime::now()));
    fs::read(&path).ok()
}

pub fn cache_exists(cat: CacheCategory, url: &str, max_age_secs: u64) -> bool {
    let dir = get_category_dir(cat);
    let key = cache_key(url);
    let path = dir.join(&key);
    if !path.exists() {
        return false;
    }
    let effective = if max_age_secs > 0 { max_age_secs } else { cat.ttl_secs() };
    if effective == 0 {
        return true;
    }
    if let Ok(meta) = path.metadata() {
        if let Ok(modified) = meta.modified() {
            if let Ok(elapsed) = modified.elapsed() {
                return elapsed.as_secs() < effective;
            }
        }
    }
    false
}

pub fn cache_delete(cat: CacheCategory, url: &str) -> Result<()> {
    let dir = get_category_dir(cat);
    let path = dir.join(cache_key(url));
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

pub fn cache_clear_category(cat: CacheCategory) -> Result<usize> {
    let dir = get_category_dir(cat);
    let count = fs::read_dir(&dir).map(|d| d.count()).unwrap_or(0);
    if dir.exists() {
        fs::remove_dir_all(&dir)?;
        fs::create_dir_all(&dir)?;
    }
    Ok(count)
}

pub fn cache_clear_all() -> Result<usize> {
    let mut total = 0;
    for cat in CacheCategory::all() {
        total += cache_clear_category(*cat)?;
    }
    Ok(total)
}

fn enforce_limits(cat: CacheCategory) {
    let dir = get_category_dir(cat);
    let (max_files, max_bytes) = cat.limits();
    let ttl = cat.ttl_secs();
    let mut files: Vec<(PathBuf, SystemTime, u64)> = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Ok(meta) = path.metadata() {
                let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                if ttl > 0 {
                    if let Ok(elapsed) = mtime.elapsed() {
                        if elapsed.as_secs() > ttl {
                            let _ = fs::remove_file(&path);
                            continue;
                        }
                    }
                }
                files.push((path, mtime, meta.len()));
            }
        }
    }
    files.sort_by_key(|(_, t, _)| *t);

    let mut total_size: u64 = files.iter().map(|(_, _, s)| s).sum();
    let mut removed = 0;

    while files.len() - removed > max_files {
        total_size -= files[removed].2;
        let _ = fs::remove_file(&files[removed].0);
        removed += 1;
    }
    while total_size > max_bytes && removed < files.len() {
        total_size -= files[removed].2;
        let _ = fs::remove_file(&files[removed].0);
        removed += 1;
    }
}

fn enforce_total_limit() {
    let max_total = get_total_limit();
    let mut all_files: Vec<(PathBuf, SystemTime, u64)> = Vec::new();

    for cat in CacheCategory::all() {
        let dir = get_category_dir(*cat);
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Ok(meta) = path.metadata() {
                    all_files.push((
                        path,
                        meta.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                        meta.len(),
                    ));
                }
            }
        }
    }

    let current_total: u64 = all_files.iter().map(|(_, _, s)| s).sum();
    if current_total <= max_total {
        return;
    }

    all_files.sort_by_key(|(_, t, _)| *t);
    let mut to_free = current_total - max_total;
    for (path, _, size) in &all_files {
        if to_free == 0 {
            break;
        }
        if path.exists() {
            let _ = fs::remove_file(path);
            to_free = to_free.saturating_sub(*size);
        }
    }
}

pub fn cache_stats() -> CacheStats {
    let mut total_size: u64 = 0;
    let mut total_files: usize = 0;
    let mut categories: Vec<CategoryStats> = Vec::new();

    for cat in CacheCategory::all() {
        let dir = get_category_dir(*cat);
        let (size, count) = dir_stats(&dir, 0);
        total_size += size;
        total_files += count;
        categories.push(CategoryStats {
            key: cat.dir_name().to_string(),
            name: cat.display_name().to_string(),
            size,
            count,
        });
    }
    categories.sort_by(|a, b| b.size.cmp(&a.size));

    CacheStats {
        path: get_cache_root().to_string_lossy().to_string(),
        total_size,
        total_files,
        max_total_bytes: get_total_limit(),
        categories,
    }
}

pub struct CacheStats {
    pub path: String,
    pub total_size: u64,
    pub total_files: usize,
    pub max_total_bytes: u64,
    pub categories: Vec<CategoryStats>,
}

pub struct CategoryStats {
    pub key: String,
    pub name: String,
    pub size: u64,
    pub count: usize,
}

fn dir_stats(path: &PathBuf, depth: usize) -> (u64, usize) {
    if depth > MAX_DIR_DEPTH {
        return (0, 0);
    }
    let mut size: u64 = 0;
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let (s, c) = dir_stats(&p, depth + 1);
                size += s;
                count += c;
            } else if let Ok(meta) = p.metadata() {
                size += meta.len();
                count += 1;
            }
        }
    }
    (size, count)
}

fn get_total_limit() -> u64 {
    if let Ok(Some(raw)) = db::store_get("cacheConfig") {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(limit) = config.get("maxTotalBytes").and_then(|v| v.as_u64()) {
                return limit;
            }
        }
    }
    200 * 1024 * 1024
}
