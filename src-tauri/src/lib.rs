pub mod commands;
pub mod error;
pub mod network;
pub mod js_runtime;
pub mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::store_get,
            commands::store_set,
            commands::store_delete,
            commands::store_get_all,
            commands::get_book_sources,
            commands::add_book_source,
            commands::import_sources_from_url,
            commands::toggle_book_source,
            commands::delete_book_source,
            commands::delete_failed_sources,
            commands::test_book_source,
            commands::test_all_sources,
            commands::get_explore_categories,
            commands::execute_js_rule,
            commands::source_login,
            commands::source_login_ui,
            commands::source_login_action,
            commands::fetch_url,
            commands::download_binary,
            commands::proxy_image,
            commands::login_webview,
            commands::engine_search,
            commands::engine_batch_search,
            commands::engine_get_toc,
            commands::engine_get_content,
            commands::engine_get_book_info,
            commands::engine_parse_rule,
            commands::import_txt,
            commands::get_local_book_chapters,
            commands::get_local_chapter_content,
            commands::optimize_book_source,
            commands::optimize_book_sources,
            commands::cache_get_info,
            commands::cache_clear,
            commands::cache_clear_category,
            commands::cache_get_cover,
            commands::cache_put_cover,
            commands::cache_put_covers,
            commands::cache_put_toc,
            commands::cache_get_toc,
            commands::cache_has_cover,
            commands::cache_set_max_size,
            commands::cache_migrate,
            commands::comic_fetch_image,
            commands::comic_prefetch_images,
            commands::comic_clear_cache,
        ])
        .setup(|app| {
            crate::js_runtime::ops::set_app_handle(app.handle().clone());
            let app_data_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("abyss-reader"));
            std::fs::create_dir_all(&app_data_dir).ok();
            let lib_cache_dir = app_data_dir.join("lib_cache");
            crate::js_runtime::ops::set_lib_cache_dir(lib_cache_dir);
            let image_cache_dir = app_data_dir.join("image_cache");
            crate::commands::fetch_url::set_image_cache_dir(image_cache_dir);
            crate::js_runtime::ops::set_cookie_save_dir(app_data_dir.clone());
            crate::storage::cache::init_cache_dir(&app_data_dir);

            let db_path = app_data_dir.join("abyss-reader.db");
            if let Err(e) = storage::init_db(db_path.to_str().unwrap_or("abyss-reader.db")) {
                eprintln!("初始化数据库失败: {}", e);
            }

            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动失败");
}
