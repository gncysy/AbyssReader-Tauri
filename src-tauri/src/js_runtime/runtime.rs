use anyhow::Result;
use deno_core::{JsRuntime, RuntimeOptions};
use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

const POLYFILL_JS: &str = include_str!("polyfill.js");
const V8_COMPAT_JS: &str = include_str!("v8-compat.js");

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
    ],
);

thread_local! {
    static RUNTIME: RefCell<Option<JsRuntime>> = RefCell::new(None);
}

fn get_or_create_runtime() -> JsRuntime {
    RUNTIME.with(|cell| {
        let mut opt = cell.borrow_mut();
        if let Some(rt) = opt.take() { return rt; }
        let mut rt = JsRuntime::new(RuntimeOptions {
            extensions: vec![abyss_java::init_ops_and_esm()],
            ..Default::default()
        });
        rt.execute_script("polyfill.js", POLYFILL_JS).ok();
        rt.execute_script("v8-compat.js", V8_COMPAT_JS).ok();
        crate::js_runtime::ops::load_cookies_from_file();
        rt
    })
}

fn return_runtime(rt: JsRuntime) {
    RUNTIME.with(|cell| { *cell.borrow_mut() = Some(rt); });
}

fn escape_for_js_literal(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

// 快速扫描：检测代码是否可能包含参数与 let/const 冲突
fn needs_oxc_fix(code: &str) -> bool {
    // 收集所有函数参数名，然后检查函数体内是否有同名 let/const 声明
    let re_func = regex::Regex::new(r"function\s+\w*\s*\(([^)]*)\)").unwrap();
    let re_let = regex::Regex::new(r"\b(let|const)\s+(\w+)\s*=").unwrap();

    for caps in re_func.captures_iter(code) {
        let params_str = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let params: Vec<&str> = params_str.split(',').map(|p| p.trim().split('=').next().unwrap_or("").trim()).filter(|p| !p.is_empty()).collect();

        // 找到这个函数的 body（简化：取 { 到 } ）
        let func_start = caps.get(0).unwrap().end();
        if let Some(body) = extract_function_body_simple(code, func_start) {
            for param in &params {
                if re_let.is_match(&body) {
                    // 进一步检查是否有同名
                    let pattern = format!(r"\b(let|const)\s+{}\s*=", regex::escape(param));
                    if regex::Regex::new(&pattern).unwrap().is_match(&body) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn extract_function_body_simple(code: &str, start: usize) -> Option<String> {
    let chars: Vec<char> = code[start..].chars().collect();
    let mut depth = 0;
    let mut body_start = None;
    let mut in_string = false;
    let mut string_char = ' ';
    let mut in_template = false;
    let mut template_depth = 0;

    for (i, &ch) in chars.iter().enumerate() {
        let prev = if i > 0 { chars[i-1] } else { ' ' };
        if in_template {
            if ch == '`' && prev != '\\' { in_template = false; }
            else if template_depth > 0 {
                if ch == '{' { template_depth += 1; }
                else if ch == '}' { template_depth -= 1; }
            } else if ch == '$' && i+1 < chars.len() && chars[i+1] == '{' { template_depth = 1; }
            continue;
        }
        if in_string {
            if ch == string_char && prev != '\\' { in_string = false; }
            continue;
        }
        if ch == '`' { in_template = true; continue; }
        if ch == '"' || ch == '\'' { in_string = true; string_char = ch; continue; }
        if body_start.is_none() {
            if ch == '{' { body_start = Some(i); depth = 1; }
            continue;
        }
        if ch == '{' { depth += 1; }
        else if ch == '}' {
            depth -= 1;
            if depth == 0 {
                return Some(code[start + body_start.unwrap()..start + i].to_string());
            }
        }
    }
    None
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
                } else {
                    new_name
                };
                rename_map.insert(*symbol_id, final_name);
            }
        }
    }
    rename_map
}

fn fix_v8_compat_oxc(code: &str) -> String {
    // 快速预检：不需要修复则直接返回
    if !needs_oxc_fix(code) {
        return code.to_string();
    }

    let allocator = Allocator::default();
    let source_type = SourceType::default();
    let parser_return = Parser::new(&allocator, code, source_type).parse();

    if !parser_return.errors.is_empty() {
        return code.to_string();
    }

    let program = parser_return.program;
    let mut semantic = SemanticBuilder::new().build(&program).semantic;
    let rename_map = find_and_fix_conflicts(&semantic);
    let symbol_table = semantic.symbols_mut();
    for (symbol_id, new_name) in &rename_map {
        symbol_table.set_name(*symbol_id, new_name);
    }
    let codegen = Codegen::new()
        .with_options(CodegenOptions { comments: true, ..CodegenOptions::default() });
    codegen.build(&program).code
}

pub fn fix_v8_compat_public(code: &str) -> String {
    let js = code.trim()
        .strip_prefix("@js:").or_else(|| code.trim().strip_prefix("<js>"))
        .unwrap_or(code)
        .trim_end().strip_suffix("</js>").unwrap_or(code)
        .trim().to_string();
    fix_v8_compat_oxc(&js)
}

pub fn execute(code: &str, context_json: &str) -> Result<String, String> {
    let mut rt = get_or_create_runtime();
    let inject = format!("globalThis.__sandbox_data = {};", context_json);
    if let Err(e) = rt.execute_script("inject_context", inject) {
        return_runtime(rt);
        return Err(format!("注入上下文失败: {}", e));
    }

    let context: serde_json::Value = serde_json::from_str(context_json).unwrap_or_default();
    let js_lib = context.get("source").and_then(|s| s.get("jsLib")).and_then(|v| v.as_str()).unwrap_or("");

    let fixed_js_lib = if js_lib.is_empty() { String::new() } else { fix_v8_compat_oxc(js_lib) };
    let fixed_user_code = fix_v8_compat_oxc(code);
    let escaped_code = escape_for_js_literal(&fixed_user_code);
    let escaped_js_lib = escape_for_js_literal(&fixed_js_lib);

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

            var combined = '{}' + '\\n' + '{}';
            try {{
                eval(combined);
            }} catch(e) {{
                result = JSON.stringify({{ error: true, message: e.message || String(e), stack: (e.stack || '').substring(0, 1000) }});
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
        escaped_js_lib, escaped_code
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
