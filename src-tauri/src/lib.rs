pub mod error;
pub mod storage;
pub mod commands;
pub mod network;
pub mod js_runtime;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::store_get,
            commands::store_set,
            commands::store_delete,
            commands::store_get_all,
            commands::get_bookshelf,
            commands::add_to_bookshelf,
            commands::remove_from_bookshelf,
            commands::update_reading_progress,
            commands::get_reading_progress,
            commands::get_book_sources,
            commands::add_book_source,
            commands::import_sources_from_url,
            commands::toggle_book_source,
            commands::delete_book_source,
            commands::delete_failed_sources,
            commands::test_book_source,
            commands::test_all_sources,
            commands::get_explore_categories,
            commands::engine_search,
            commands::engine_batch_search,
            commands::engine_get_toc,
            commands::engine_get_content,
            commands::engine_get_book_info,
            commands::engine_get_explore_books,
            commands::engine_parse_rule,
            commands::execute_js_rule,
            commands::fetch_url,
            commands::import_txt,
            commands::get_local_book_chapters,
            commands::get_local_chapter_content,
        ])
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("abyss-reader"));
            std::fs::create_dir_all(&app_data_dir).ok();

            let db_path = app_data_dir.join("abyss-reader.db");
            if let Err(e) = storage::init_db(db_path.to_str().unwrap_or("abyss-reader.db")) {
                eprintln!("初始化数据库失败: {}", e);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
