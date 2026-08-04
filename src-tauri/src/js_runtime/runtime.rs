use anyhow::Result;
use deno_core::{JsRuntime, RuntimeOptions};
use oxc_allocator::Allocator;
use oxc_ast::ast::Statement;
use oxc_parser::{Parser, ParserReturn};
use oxc_span::{SourceType, GetSpan, Span};

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
        crate::js_runtime::ops::op_java_des_base64_decode,
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
        crate::js_runtime::ops::op_java_read_txt_file,
        crate::js_runtime::ops::op_java_read_file_bytes_base64,
        crate::js_runtime::ops::op_java_delete_file,
        crate::js_runtime::ops::op_java_get_txt_in_folder,
        crate::js_runtime::ops::op_java_file_exists,
        crate::js_runtime::ops::op_java_unarchive_file,
        crate::js_runtime::ops::op_java_zip_content,
        crate::js_runtime::ops::op_java_sign,
        crate::js_runtime::ops::op_java_query_ttf,
    ],
);

pub fn create_fresh_runtime() -> JsRuntime {
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
}

pub fn execute_in_runtime(rt: &mut JsRuntime, code: &str, context_json: &serde_json::Value) -> Result<String, String> {
    let ctx = serde_json::to_string(context_json).unwrap_or_else(|_| "{}".into());
    execute_impl(rt, code, &ctx)
}

pub fn execute(code: &str, context_json: &str) -> Result<String, String> {
    let mut rt = create_fresh_runtime();
    execute_impl(&mut rt, code, context_json)
}

fn st<'a>(code: &'a str, span: Span) -> &'a str {
    &code[span.start as usize..span.end as usize]
}

fn between<'a>(code: &'a str, from: Span, to: Span) -> &'a str {
    &code[from.end as usize..to.start as usize]
}

fn is_block(s: &Statement) -> bool {
    matches!(s, Statement::BlockStatement(_))
}

fn needs_wrap(s: &Statement) -> bool {
    matches!(
        s,
        Statement::ExpressionStatement(_)
            | Statement::IfStatement(_)
            | Statement::SwitchStatement(_)
            | Statement::ForStatement(_)
            | Statement::WhileStatement(_)
            | Statement::DoWhileStatement(_)
            | Statement::WithStatement(_)
            | Statement::ForInStatement(_)
            | Statement::ForOfStatement(_)
            | Statement::BlockStatement(_)
    )
}

fn to_expr(code: &str, s: &Statement) -> String {
    match s {
        Statement::ExpressionStatement(e) => st(code, e.span()).trim_end_matches(';').trim().to_string(),
        Statement::BlockStatement(b) => {
            if b.body.is_empty() { return "undefined".to_string(); }
            to_expr(code, b.body.last().unwrap())
        }
        Statement::IfStatement(i) => {
            format!(
                "({} ? {} : {})",
                st(code, i.test.span()),
                to_expr(code, &i.consequent),
                i.alternate.as_ref().map(|a| to_expr(code, a)).unwrap_or_else(|| "undefined".to_string())
            )
        }
        _ => format!("(function() {{ {} }})()", to_ret(code, s)),
    }
}

fn to_ret(code: &str, s: &Statement) -> String {
    match s {
        Statement::ExpressionStatement(e) => {
            format!("return {};", st(code, e.span()).trim_end_matches(';').trim())
        }
        Statement::BlockStatement(b) => {
            if b.body.is_empty() { return "{}".to_string(); }
            let mut inner = String::new();
            let len = b.body.len();
            for i in 0..len {
                let s = &b.body[i];
                if i > 0 {
                    inner.push_str(between(code, b.body[i-1].span(), s.span()));
                }
                if i < len - 1 {
                    inner.push_str(st(code, s.span()));
                } else if needs_wrap(s) {
                    inner.push_str(&to_ret(code, s));
                } else {
                    inner.push_str(st(code, s.span()));
                }
            }
            format!("{{ {} }}", inner)
        }
        Statement::IfStatement(i) => {
            let cons = &i.consequent;
            let then_val = if is_block(cons) {
                format!("(function() {})()", to_ret(code, cons))
            } else {
                format!("(function() {{ {} }})()", to_ret(code, cons))
            };
            let else_val = i.alternate.as_ref().map(|a| {
                if is_block(a) { format!("(function() {})()", to_ret(code, a)) }
                else { format!("(function() {{ {} }})()", to_ret(code, a)) }
            }).unwrap_or_else(|| "undefined".to_string());
            format!("return ({} ? {} : {});", st(code, i.test.span()), then_val, else_val)
        }
        Statement::SwitchStatement(sw) => {
            let mut cases = String::new();
            for c in &sw.cases {
                if c.consequent.is_empty() {
                    cases.push_str(st(code, c.span()));
                } else {
                    let first_sp = c.consequent.first().unwrap().span();
                    let hdr = &code[c.span().start as usize..first_sp.start as usize];
                    let last = c.consequent.last().unwrap();
                    let lt = if needs_wrap(last) { to_ret(code, last) } else { st(code, last.span()).to_string() };
                    let mut pre = String::new();
                    let cl = c.consequent.len();
                    for i in 0..cl - 1 {
                        if i > 0 {
                            pre.push_str(between(code, c.consequent[i-1].span(), c.consequent[i].span()));
                        }
                        pre.push_str(st(code, c.consequent[i].span()));
                    }
                    if cl > 1 {
                        pre.push_str(between(code, c.consequent[cl-2].span(), last.span()));
                    }
                    cases.push_str(&format!("{}{}{}", hdr, pre, lt));
                }
            }
            format!("return (function() {{ switch ({}) {{ {} }} }})();", st(code, sw.discriminant.span()), cases)
        }
        Statement::ForStatement(f) => {
            let init = f.init.as_ref().map(|i| st(code, i.span())).unwrap_or("");
            let test = f.test.as_ref().map(|t| st(code, t.span())).unwrap_or("");
            let update = f.update.as_ref().map(|u| st(code, u.span())).unwrap_or("");
            let body = to_expr(code, &f.body);
            format!("var __last = undefined; for ({}; {}; {}) {{ __last = ({}); }} return __last;", init, test, update, body)
        }
        Statement::WhileStatement(w) => {
            let body = to_expr(code, &w.body);
            format!("var __last = undefined; while ({}) {{ __last = ({}); }} return __last;", st(code, w.test.span()), body)
        }
        Statement::DoWhileStatement(d) => {
            let body = to_expr(code, &d.body);
            format!("var __last = undefined; do {{ __last = ({}); }} while ({}); return __last;", body, st(code, d.test.span()))
        }
        Statement::ForInStatement(f) => {
            let body = to_expr(code, &f.body);
            format!("var __last = undefined; for ({} in {}) {{ __last = ({}); }} return __last;", st(code, f.left.span()), st(code, f.right.span()), body)
        }
        Statement::ForOfStatement(f) => {
            let body = to_expr(code, &f.body);
            format!("var __last = undefined; for ({} of {}) {{ __last = ({}); }} return __last;", st(code, f.left.span()), st(code, f.right.span()), body)
        }
        Statement::WithStatement(w) => {
            format!("return (function() {{ with ({}) {{ {} }} }})();", st(code, w.object.span()), to_ret(code, &w.body))
        }
        Statement::LabeledStatement(l) => {
            if needs_wrap(&l.body) {
                format!("{}: (function() {{ {} }})()", st(code, l.label.span()), to_ret(code, &l.body))
            } else {
                format!("{}: {}", st(code, l.label.span()), st(code, l.body.span()))
            }
        }
        _ => st(code, s.span()).to_string(),
    }
}

fn wrap_user_code(code: &str) -> String {
    let allocator = Allocator::default();
    let source_type = SourceType::from_path("rule.js").unwrap_or_default();
    let ParserReturn { program, errors, .. } =
        Parser::new(&allocator, code, source_type).parse();

    if !errors.is_empty() { return code.to_string(); }
    let body = &program.body;
    if body.is_empty() { return code.to_string(); }

    let last = body.last().unwrap();
    if matches!(
        last,
        Statement::ReturnStatement(_)
            | Statement::ThrowStatement(_)
            | Statement::TryStatement(_)
            | Statement::FunctionDeclaration(_)
            | Statement::ClassDeclaration(_)
            | Statement::VariableDeclaration(_)
            | Statement::ImportDeclaration(_)
            | Statement::ExportNamedDeclaration(_)
            | Statement::ExportDefaultDeclaration(_)
            | Statement::EmptyStatement(_)
            | Statement::DebuggerStatement(_)
    ) {
        return code.to_string();
    }

    let mut result = String::new();
    let len = body.len();
    for i in 0..len - 1 {
        result.push_str(st(code, body[i].span()));
        result.push_str(between(code, body[i].span(), body[i+1].span()));
    }
    result.push_str(&to_ret(code, last));
    result
}

fn execute_impl(rt: &mut JsRuntime, code: &str, context_json: &str) -> Result<String, String> {
    let wrapped = wrap_user_code(code);

    let inject = format!("globalThis.__sandbox_data = {};", context_json);
    if let Err(e) = rt.execute_script("inject_context", inject) {
        return Err(format!("注入上下文失败: {}", e));
    }

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
            var title = chapter.title || '';
            var nextChapterUrl = __data.nextChapterUrl || '';
            var rssArticle = __data.rssArticle || null;
            var fromBookInfo = __data.fromBookInfo || false;
            var java = globalThis.java || {{}};
            var cookie = globalThis.cookie || {{}};
            var Packages = globalThis.Packages || {{}};
            var cache = globalThis.cache || {{}};
            var org = globalThis.org || Packages.org || {{}};

            if (cache && typeof cache.putMemory !== 'function') {{
                cache._memory = cache._memory || {{}};
                cache.putMemory = function(k, v) {{ this._memory[k] = v; }};
                cache.getFromMemory = function(k) {{ return this._memory[k] || null; }};
                cache.deleteMemory = function(k) {{ delete this._memory[k]; }};
            }}

            if (source && !source.getKey) source.getKey = function() {{ return source.bookSourceUrl || ''; }};
            if (source && !source.getVariable) source.getVariable = function(k) {{ return (java.get('source_' + k)) || ''; }};
            if (source && !source.setVariable) source.setVariable = function(k, v) {{ java.put('source_' + k, String(v)); return v; }};
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

            var execResult;
            try {{
                execResult = (function(org_local, Packages_local, Jsoup_local, Element_local, Elements_local) {{
                    var org = org_local;
                    var Packages = Packages_local;
                    var Jsoup = Jsoup_local;
                    var Element = Element_local;
                    var Elements = Elements_local;
                    {0}
                }})(org, Packages, (org.jsoup && org.jsoup.Jsoup), (org.jsoup && org.jsoup.select && org.jsoup.select.Element), (org.jsoup && org.jsoup.select && org.jsoup.select.Elements));
            }} catch(e) {{
                execResult = {{ __error: true, __message: e.message || String(e), __stack: (e.stack || '').substring(0, 1000) }};
            }}
            if (execResult === undefined && typeof result !== 'undefined' && result !== '') {{
                execResult = result;
            }}

            if (execResult && typeof execResult === 'object' && execResult !== null) {{
                if (typeof execResult.html === 'function') {{
                    execResult = execResult.html();
                }} else if (typeof execResult.outerHtml === 'function') {{
                    execResult = execResult.outerHtml();
                }} else if (execResult.__error) {{
                    return JSON.stringify({{ error: true, message: execResult.__message, stack: execResult.__stack }});
                }}
            }}

            if (execResult === null || execResult === undefined) return '';
            if (typeof execResult === 'object' && !(execResult instanceof String)) {{
                try {{ return JSON.stringify(execResult); }} catch(e) {{ return ''; }}
            }}
            return String(execResult);
        }})()
        "#,
        wrapped
    );

    let result_str = match rt.execute_script("rule_script", wrapper) {
        Ok(global) => {
            let scope = &mut rt.handle_scope();
            let local = deno_core::v8::Local::new(scope, global);
            local.to_rust_string_lossy(scope)
        }
        Err(e) => {
            return Err(format!("执行失败: {}", e));
        }
    };

    Ok(result_str)
}

pub fn fix_v8_compat_public(_code: &str) -> String {
    _code.to_string()
}



