use anyhow::Result;
use deno_core::{JsRuntime, RuntimeOptions};
use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

const POLYFILL_CORE: &str = include_str!("polyfill_core.js");
const POLYFILL_CRYPTO_SHA1: &str = include_str!("polyfill_crypto/sha1.js");
const POLYFILL_CRYPTO_SHA256: &str = include_str!("polyfill_crypto/sha256.js");
const POLYFILL_CRYPTO_SHA512: &str = include_str!("polyfill_crypto/sha512.js");
const POLYFILL_CRYPTO_MD5: &str = include_str!("polyfill_crypto/md5.js");
const POLYFILL_CRYPTO_BASE64: &str = include_str!("polyfill_crypto/base64.js");
const POLYFILL_CRYPTO_PADDING: &str = include_str!("polyfill_crypto/padding.js");
const POLYFILL_CRYPTO_HMAC: &str = include_str!("polyfill_crypto/hmac.js");
const POLYFILL_CRYPTO_AES: &str = include_str!("polyfill_crypto/aes.js");
const POLYFILL_CRYPTO_DES: &str = include_str!("polyfill_crypto/des.js");
const POLYFILL_CRYPTO_API: &str = include_str!("polyfill_crypto/crypto_api.js");
const POLYFILL_NET: &str = include_str!("polyfill_net.js");
const POLYFILL_DOM: &str = include_str!("polyfill_dom.js");

deno_core::extension!(
    abyss_java,
    ops = [
        crate::js_runtime::ops::op_java_ajax,
        crate::js_runtime::ops::op_java_web_js,
        crate::js_runtime::ops::op_java_emit_log,
        crate::js_runtime::ops::op_jsoup_parse,
        crate::js_runtime::ops::op_java_base64_encode,
        crate::js_runtime::ops::op_java_base64_decode,
        crate::js_runtime::ops::op_java_md5_encode,
        crate::js_runtime::ops::op_java_aes_base64_decode,
        crate::js_runtime::ops::op_java_put,
        crate::js_runtime::ops::op_java_get,
        crate::js_runtime::ops::op_java_get_cookie,
        crate::js_runtime::ops::op_java_set_cookie,
        crate::js_runtime::ops::op_java_start_browser,
        crate::js_runtime::ops::op_java_time_format,
        crate::js_runtime::ops::op_java_encode_uri,
        crate::js_runtime::ops::op_java_decode_uri,
        crate::js_runtime::ops::op_java_t2s,
        crate::js_runtime::ops::op_java_s2t,
        crate::js_runtime::ops::op_java_random_uuid,
        crate::js_runtime::ops::op_java_cache_file,
        crate::js_runtime::ops::op_java_copy_text,
        crate::js_runtime::ops::op_java_get_verification_code,
        crate::js_runtime::ops::op_java_up_login_data,
        crate::js_runtime::ops::op_java_refresh_explore,
        crate::js_runtime::ops::op_java_refresh_book_info,
        crate::js_runtime::ops::op_java_search_book,
        crate::js_runtime::ops::op_java_save_cookies,
        crate::js_runtime::ops::op_java_load_cookies,
        crate::js_runtime::ops::op_java_start_browser_await,
        crate::js_runtime::ops::op_java_login_complete,
        crate::js_runtime::ops::op_java_show_photo,
        crate::js_runtime::ops::op_java_open_video_player,
        crate::js_runtime::ops::op_java_download_file,
        crate::js_runtime::ops::op_java_rsa_set_public_key,
        crate::js_runtime::ops::op_java_rsa_set_private_key,
        crate::js_runtime::ops::op_java_rsa_encrypt,
        crate::js_runtime::ops::op_java_rsa_decrypt,
    ],
);

thread_local! {
    static RUNTIME: RefCell<Option<JsRuntime>> = RefCell::new(None);
}

fn get_or_create_runtime() -> JsRuntime {
    RUNTIME.with(|cell| {
        let mut opt = cell.borrow_mut();
        if let Some(rt) = opt.take() {
            return rt;
        }
        let mut rt = JsRuntime::new(RuntimeOptions {
            extensions: vec![abyss_java::init_ops_and_esm()],
            ..Default::default()
        });
        rt.execute_script("polyfill_core.js", POLYFILL_CORE).ok();
        rt.execute_script("polyfill_crypto_sha1.js", POLYFILL_CRYPTO_SHA1).ok();
        rt.execute_script("polyfill_crypto_sha256.js", POLYFILL_CRYPTO_SHA256).ok();
        rt.execute_script("polyfill_crypto_sha512.js", POLYFILL_CRYPTO_SHA512).ok();
        rt.execute_script("polyfill_crypto_md5.js", POLYFILL_CRYPTO_MD5).ok();
        rt.execute_script("polyfill_crypto_base64.js", POLYFILL_CRYPTO_BASE64).ok();
        rt.execute_script("polyfill_crypto_padding.js", POLYFILL_CRYPTO_PADDING).ok();
        rt.execute_script("polyfill_crypto_hmac.js", POLYFILL_CRYPTO_HMAC).ok();
        rt.execute_script("polyfill_crypto_aes.js", POLYFILL_CRYPTO_AES).ok();
        rt.execute_script("polyfill_crypto_des.js", POLYFILL_CRYPTO_DES).ok();
        rt.execute_script("polyfill_crypto_api.js", POLYFILL_CRYPTO_API).ok();
        rt.execute_script("polyfill_net.js", POLYFILL_NET).ok();
        rt.execute_script("polyfill_dom.js", POLYFILL_DOM).ok();
        crate::js_runtime::ops::load_cookies_from_file();
        rt
    })
}

fn return_runtime(rt: JsRuntime) {
    RUNTIME.with(|cell| {
        *cell.borrow_mut() = Some(rt);
    });
}

fn escape_for_js_literal(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn find_and_fix_conflicts(
    semantic: &oxc_semantic::Semantic,
) -> HashMap<oxc_semantic::SymbolId, String> {
    let scope_tree = semantic.scopes();
    let mut rename_map: HashMap<oxc_semantic::SymbolId, String> = HashMap::new();
    let mut scope_bindings: HashMap<
        oxc_semantic::ScopeId,
        Vec<(oxc_semantic::SymbolId, String)>,
    > = HashMap::new();
    for (scope_id, symbol_id, name) in scope_tree.iter_bindings() {
        scope_bindings
            .entry(scope_id)
            .or_default()
            .push((symbol_id, name.to_string()));
    }
    for (_scope_id, bindings) in &scope_bindings {
        if bindings.len() <= 1 { continue; }
        let mut name_to_symbols: HashMap<&str, Vec<oxc_semantic::SymbolId>> = HashMap::new();
        for (symbol_id, name) in bindings {
            name_to_symbols.entry(name.as_str()).or_default().push(*symbol_id);
        }
        for (name, symbols) in &name_to_symbols {
            if symbols.len() <= 1 { continue; }
            let all_names: HashSet<&str> = bindings.iter().map(|(_, n)| n.as_str()).collect();
            for (i, symbol_id) in symbols.iter().enumerate() {
                if i == 0 { continue; }
                let new_name = format!("_{}", name);
                let final_name = if all_names.contains(new_name.as_str()) {
                    format!("_{}_v8", name)
                } else { new_name };
                rename_map.insert(*symbol_id, final_name);
            }
        }
    }
    rename_map
}

pub fn fix_v8_compat_public(code: &str) -> String {
    let js = code
        .trim()
        .strip_prefix("@js:")
        .or_else(|| code.trim().strip_prefix("<js>"))
        .unwrap_or(code)
        .trim_end()
        .strip_suffix("</js>")
        .unwrap_or(code)
        .trim()
        .to_string();
    let allocator = Allocator::default();
    let parser_return = Parser::new(&allocator, &js, SourceType::default()).parse();
    if !parser_return.errors.is_empty() { return code.to_string(); }
    let program = parser_return.program;
    let mut semantic = SemanticBuilder::new().build(&program).semantic;
    let rename_map = find_and_fix_conflicts(&semantic);
    let symbol_table = semantic.symbols_mut();
    for (symbol_id, new_name) in &rename_map {
        symbol_table.set_name(*symbol_id, new_name);
    }
    Codegen::new()
        .with_options(CodegenOptions { comments: true, ..CodegenOptions::default() })
        .build(&program)
        .code
}

pub fn execute(code: &str, context_json: &str) -> Result<String, String> {
    let mut rt = get_or_create_runtime();

    let inject = format!("globalThis.__sandbox_data = {};", context_json);
    if let Err(e) = rt.execute_script("inject_context", inject) {
        return_runtime(rt);
        return Err(format!("注入上下文失败: {}", e));
    }

    let escaped_code = escape_for_js_literal(code);
    let wrapper = format!(
        r#"
        (function() {{
            var __data = globalThis.__sandbox_data || {{}};
            var result = __data.result || '';
            var src = __data.src || result;
            var source = __data.source || {{}};
            var baseUrl = __data.baseUrl || '';
            var key = __data.key || '';
            var page = __data.page || 1;
            var book = __data.book || {{}};
            var chapter = __data.chapter || {{}};
            var java = globalThis.java || {{}};
            var cookie = globalThis.cookie || {{}};
            var Packages = globalThis.Packages || {{}};
            var cache = globalThis.cache || {{}};

            if (source && !source.getKey) source.getKey = function() {{ return source.bookSourceUrl || ''; }};
            if (source && !source.getTag) source.getTag = function() {{ return source.bookSourceName || ''; }};
            if (source && !source.getLoginHeader) source.getLoginHeader = function() {{ return java.getLoginHeader(); }};
            if (source && !source.putLoginHeader) source.putLoginHeader = function(h) {{ java.putLoginHeader(h); }};
            if (source && !source.getLoginInfoMap) source.getLoginInfoMap = function() {{ return java.getLoginInfoMap(); }};
            if (source && !source.refreshExplore) source.refreshExplore = function() {{ }};

            var bookVars = {{}};
            if (!book.putVariable) book.putVariable = function(k, v) {{ bookVars[k] = String(v); java.put('book_' + k, String(v)); return v; }};
            if (!book.getVariable) book.getVariable = function(k) {{ return bookVars[k] || java.get('book_' + k); }};
            if (!book.setReverseToc) book.setReverseToc = function(v) {{ java.put('book_reverseToc', v ? '1' : '0'); }};
            if (!book.getBookUrl) book.getBookUrl = function() {{ return book.bookUrl || ''; }};

            var chapterVars = {{}};
            if (!chapter.putVariable) chapter.putVariable = function(k, v) {{ chapterVars[k] = String(v); java.put('ch_' + k, String(v)); return v; }};
            if (!chapter.getVariable) chapter.getVariable = function(k) {{ return chapterVars[k] || java.get('ch_' + k); }};
            if (!chapter.getUrl) chapter.getUrl = function() {{ return chapter.url || ''; }};

            try {{ globalThis.__loadJsLib(source, java); }} catch(e) {{ }}

            var evalResult;
            try {{
                evalResult = eval('{}');
            }} catch(e) {{
                evalResult = undefined;
                result = JSON.stringify({{ error: true, message: e.message || String(e), stack: (e.stack || '').substring(0, 1000) }});
            }}
            if (evalResult !== undefined && evalResult !== null) {{
                result = evalResult;
            }}

            if (result === null || result === undefined) {{
                return '';
            }}
            if (typeof result === 'object') {{
                try {{ return JSON.stringify(result); }} catch(e) {{ return ''; }}
            }}
            return String(result);
        }})()
        "#,
        escaped_code
    );

    let result_str = match rt.execute_script("rule_script", wrapper) {
        Ok(global) => {
            let scope = &mut rt.handle_scope();
            let local = deno_core::v8::Local::new(scope, global);
            local.to_rust_string_lossy(scope)
        }
        Err(e) => {
            return_runtime(rt);
            return Err(format!("执行失败: {}", e));
        }
    };

    return_runtime(rt);
    Ok(result_str)
}
