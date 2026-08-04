pub mod commands;
pub mod error;
pub mod network;
pub mod js_runtime;
pub mod storage;

use tauri::Manager;
use tauri::WebviewWindowBuilder;
use tauri::WebviewUrl;

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
            commands::dict_query,
            commands::source_login,
            commands::source_login_ui,
            commands::source_login_action,
            commands::fetch_url,
            commands::download_binary,
            commands::proxy_image,
            commands::login_webview,
            commands::rss_open_url,            commands::engine_search,
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
            commands::cache_put_content,
            commands::cache_get_content,
            commands::cache_has_cover,
            commands::cache_set_max_size,
            commands::cache_migrate,
            commands::comic_fetch_image,
            commands::comic_prefetch_images,
            commands::comic_clear_cache,
        ])
        .setup(|app| {
            use crate::js_runtime::ops;
            use crate::storage::cache;
            
            ops::set_app_handle(app.handle().clone());
            let app_data_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("abyss-reader"));
            std::fs::create_dir_all(&app_data_dir).ok();
            let lib_cache_dir = app_data_dir.join("lib_cache");
            ops::set_lib_cache_dir(lib_cache_dir);
            let image_cache_dir = app_data_dir.join("image_cache");
            crate::commands::fetch_url::set_image_cache_dir(image_cache_dir);
            ops::set_cookie_save_dir(app_data_dir.clone());
            cache::init_cache_dir(&app_data_dir);

            let db_path = app_data_dir.join("abyss-reader.db");
            if let Err(e) = crate::storage::init_db(db_path.to_str().unwrap_or("abyss-reader.db")) {
                eprintln!("初始化数据库失败: {}", e);
            }

            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                }
            }

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("墨阅")
                .inner_size(1200.0, 800.0)
                .min_inner_size(800.0, 600.0)
                .center()
                .decorations(false)
                .background_color(tauri::window::Color(26, 26, 26, 255))
                .visible(true)
                .build()
                .unwrap();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动失败");
}

