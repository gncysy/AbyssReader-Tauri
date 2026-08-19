use anyhow::Result;
use deno_core::{JsRuntime, RuntimeOptions, v8};
use std::cell::RefCell;
use serde_json::Value;

const POLYFILL_CORE: &str = include_str!("polyfills/core.js");
const POLYFILL_NET: &str = include_str!("polyfills/net.js");
const POLYFILL_DOM: &str = include_str!("polyfills/dom.js");

const MAX_JS_LIBS: usize = 50;

thread_local! {
    static RUNTIME_SLOT: RefCell<Option<JsRuntime>> = RefCell::new(None);
}

fn get_or_create_runtime() -> JsRuntime {
    RUNTIME_SLOT.with(|slot| {
        let mut s = slot.borrow_mut();
        s.take().unwrap_or_else(create_fresh_runtime)
    })
}

fn return_runtime(rt: JsRuntime) {
    RUNTIME_SLOT.with(|slot| {
        let mut s = slot.borrow_mut();
        *s = Some(rt);
    })
}

fn discard_runtime() {
    RUNTIME_SLOT.with(|slot| {
        *slot.borrow_mut() = None;
    });
}

pub fn create_fresh_runtime() -> JsRuntime {
    let mut rt = JsRuntime::new(RuntimeOptions {
        extensions: vec![super::ops::abyss_java::init()],
        ..Default::default()
    });

    rt.execute_script("polyfill_core.js", POLYFILL_CORE)
        .expect("polyfill_core.js 加载失败");
    rt.execute_script("polyfill_net.js", POLYFILL_NET)
        .expect("polyfill_net.js 加载失败");
    rt.execute_script("polyfill_dom.js", POLYFILL_DOM)
        .expect("polyfill_dom.js 加载失败");

    super::ops::load_cookies_from_file();
    rt
}

fn load_js_libs(rt: &mut JsRuntime, source: &Value) -> Result<(), String> {
    if let Some(js_lib_str) = source.get("jsLib").and_then(|v| v.as_str()) {
        if let Ok(libs) = serde_json::from_str::<std::collections::HashMap<String, String>>(js_lib_str) {
            if libs.len() > MAX_JS_LIBS {
                eprintln!("[jsLib] 过多 JS 库: {}，跳过", libs.len());
                return Ok(());
            }
            for (name, url) in libs {
                let cache_key = format!("{:x}", md5::compute(url.as_bytes()));
                let cache_path = crate::storage::cache::get_category_dir(
                    crate::storage::cache::CacheCategory::Lib
                )
                .join(&cache_key);

                let content = if cache_path.exists() {
                    match std::fs::read_to_string(&cache_path) {
                        Ok(data) => data,
                        Err(e) => {
                            eprintln!("[jsLib] 读取缓存失败 {}: {}", url, e);
                            continue;
                        }
                    }
                } else {
                    match crate::network::http::execute_http_request_blocking(
                        &url, "GET", None, None, None, 30,
                    ) {
                        Ok(data) => {
                            let _ = std::fs::write(&cache_path, &data);
                            data
                        }
                        Err(e) => {
                            eprintln!("[jsLib] 下载失败 {}: {}", url, e);
                            continue;
                        }
                    }
                };

                if !content.is_empty() {
                    let script_name = format!("jslib_{}.js", name);
                    let leaked: &'static str = Box::leak(script_name.into_boxed_str());
                    if let Err(e) = rt.execute_script(leaked, content) {
                        eprintln!("[jsLib] 执行失败 {}: {}", name, e);
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn execute_in_runtime(
    rt: &mut JsRuntime,
    code: &str,
    context_json: &serde_json::Value,
) -> Result<String, String> {
    execute_impl(rt, code, &serde_json::to_string(context_json).unwrap_or_else(|_| "{}".into()))
}

pub fn execute(code: &str, context_json: &str) -> Result<String, String> {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut rt = get_or_create_runtime();

        if let Ok(ctx) = serde_json::from_str::<serde_json::Value>(context_json) {
            if let Some(source) = ctx.get("source") {
                let _ = load_js_libs(&mut rt, source);
            }
        }

        match execute_impl(&mut rt, code, context_json) {
            Ok(result) => {
                return_runtime(rt);
                Ok(result)
            }
            Err(e) => {
                return_runtime(rt);
                Err(e)
            }
        }
    }));

    match result {
        Ok(inner) => inner,
        Err(_panic) => {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                discard_runtime();
            }));
            Err("沙箱执行崩溃，已重建".to_string())
        }
    }
}

fn wrap_user_code(code: &str) -> String {
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::{GetSpan, SourceType};
    use oxc_ast::ast::Statement;

    let allocator = Allocator::default();
    let source_type = SourceType::from_path("rule.js").unwrap_or_default();
    let parser_return = Parser::new(&allocator, code, source_type).parse();

    if !parser_return.errors.is_empty() {
        return code.to_string();
    }

    let body = &parser_return.program.body;
    if body.is_empty() {
        return code.to_string();
    }

    let last = body.last().unwrap();

    if let Statement::ExpressionStatement(expr) = last {
        let span = expr.span();
        let prefix = &code[..span.start as usize];
        let expr_text = &code[span.start as usize..span.end as usize]
            .trim_end_matches(';')
            .trim();
        format!("{}return {};", prefix, expr_text)
    } else {
        code.to_string()
    }
}

fn execute_impl(rt: &mut JsRuntime, code: &str, context_json: &str) -> Result<String, String> {
    let wrapped = wrap_user_code(code);

    // 安全序列化 context
    let sanitized_context = context_json
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029");

    let inject = format!("globalThis.__sandbox_data = {};", sanitized_context);

    if let Err(e) = rt.execute_script("inject_context", inject) {
        return Err(format!("注入上下文失败: {}", e));
    }

    let wrapper = format!(
        r#"(function(){{
var D=globalThis.__sandbox_data||{{}};
var result=D.result||'';
var src=D.src||result;
var source=D.source||{{}};
var baseUrl=D.baseUrl||source.bookSourceUrl||source.key||'';
var key=D.key||'';
var page=D.page||1;
var book=D.book||{{}};
var chapter=D.chapter||{{}};
var title=D.title||chapter.title||'';
var nextChapterUrl=D.nextChapterUrl||'';

// ─── 对齐 Legado BaseSource：source.key = bookSourceUrl ───
var _sourceUrl=source.bookSourceUrl||source.key||'';
if(typeof source.key==='undefined'||source.key===null||source.key===''){{
    source.key=_sourceUrl;
}}
if(typeof source.getKey!=='function'){{
    source.getKey=function(){{return _sourceUrl;}};
}}
if(typeof source.getTag!=='function'){{
    source.getTag=function(){{return source.bookSourceName||source.sourceName||source.name||'';}};
}}
if(typeof source.getSource!=='function'){{
    source.getSource=function(){{return source;}};
}}

// ─── 对齐 Legado BaseSource：put/get 变量存储 ───
if(typeof source.put!=='function'){{
    source.put=function(k,v){{return java.put('source_'+_sourceUrl+'_'+String(k),String(v));}};
}}
if(typeof source.get!=='function'){{
    source.get=function(k){{return java.get('source_'+_sourceUrl+'_'+String(k));}};
}}
if(typeof source.setVariable!=='function'){{
    source.setVariable=function(v){{return java.put('source_'+_sourceUrl+'__variable',String(v));}};
}}
if(typeof source.getVariable!=='function'){{
    source.getVariable=function(k){{
        if(k===undefined){{
            return java.get('source_'+_sourceUrl+'__variable');
        }}
        return java.get('source_'+_sourceUrl+'_'+String(k));
    }};
}}
if(typeof source.putVariable!=='function'){{
    source.putVariable=function(k,v){{return java.put('source_'+_sourceUrl+'_'+String(k),String(v));}};
}}

// ─── 对齐 Legado BaseSource：登录信息 ───
if(typeof source.getLoginHeader!=='function'){{
    source.getLoginHeader=function(){{return java.get('loginHeader_'+_sourceUrl);}};
}}
if(typeof source.putLoginHeader!=='function'){{
    source.putLoginHeader=function(h){{return java.put('loginHeader_'+_sourceUrl,String(h));}};
}}
if(typeof source.getLoginInfo!=='function'){{
    source.getLoginInfo=function(){{return java.get('userInfo_'+_sourceUrl);}};
}}
if(typeof source.putLoginInfo!=='function'){{
    source.putLoginInfo=function(i){{return java.put('userInfo_'+_sourceUrl,String(i));}};
}}

// ─── 对齐 Legado BaseSource：并发率 ───
if(typeof source.putConcurrent!=='function'){{
    source.putConcurrent=function(v){{return java.put('concurrent_'+_sourceUrl,String(v));}};
}}

// ─── book 变量存储 ───
var _bookUrl=book.bookUrl||'';
if(typeof book.setReverseToc!=='function'){{
    book.setReverseToc=function(v){{java.put('book_'+_bookUrl+'__reverseToc',v?'1':'0');}};
}}
if(typeof book.putVariable!=='function'){{
    book.putVariable=function(k,v){{java.put('book_'+_bookUrl+'__'+k,String(v));}};
}}
if(typeof book.getVariable!=='function'){{
    book.getVariable=function(k){{return java.get('book_'+_bookUrl+'__'+k);}};
}}

// ─── jsLib 加载钩子 ───
try{{
    if(typeof globalThis.__loadJsLib==='function'){{
        globalThis.__loadJsLib(source,globalThis.java);
    }}
}}catch(e){{}}

var execResult;
try{{
    execResult=(function(org_local,Packages_local,Jsoup_local,Element_local,Elements_local){{
        var org=org_local;
        var Packages=Packages_local;
        var Jsoup=Jsoup_local;
        var Element=Element_local;
        var Elements=Elements_local;
        {0}
    }})(globalThis.org||{{}},globalThis.Packages||{{}},(globalThis.org&&globalThis.org.jsoup&&globalThis.org.jsoup.Jsoup),(globalThis.org&&globalThis.org.jsoup&&globalThis.org.jsoup.select&&globalThis.org.jsoup.select.Element),(globalThis.org&&globalThis.org.jsoup&&globalThis.org.jsoup.select&&globalThis.org.jsoup.select.Elements));
}}catch(e){{
    execResult={{__error:true,__message:e.message||String(e),__stack:(e.stack||'').substring(0,2000)}};
}}
if(execResult===undefined&&typeof result!=='undefined'&&result!==''){{
    execResult=result;
}}
if(execResult&&typeof execResult==='object'&&execResult!==null){{
    if(typeof execResult.size==='function'&&typeof execResult.get==='function'){{
        var arr=[];
        for(var i=0;i<execResult.size();i++){{
            var item=execResult.get(i);
            arr.push(item===null||item===undefined?'':(typeof item==='object'?item.toString():String(item)));
        }}
        execResult=arr;
    }}else if(typeof execResult.html==='function'){{
        execResult=execResult.html();
    }}else if(typeof execResult.outerHtml==='function'){{
        execResult=execResult.outerHtml();
    }}else if(execResult.__error){{
        globalThis.java.log('DIAG|error|'+JSON.stringify({{m:execResult.__message,s:(execResult.__stack||'').substring(0,500)}}));
        return JSON.stringify({{error:true,message:execResult.__message,stack:execResult.__stack}});
    }}
}}
if(execResult===null||execResult===undefined)return'';
if(typeof execResult==='object'&&!(execResult instanceof String)){{
    try{{return JSON.stringify(execResult);}}catch(e){{return'';}}
}}
var __str=String(execResult);
var diag={{
    t:(source&&(source.bookSourceName||source.sourceName||source.name))||'?',
    u:_sourceUrl||'',
    c:typeof CryptoJS!=='undefined',
    r:typeof result==='string'?result.length:(result?JSON.stringify(result).length:-1),
    o:__str.length,
    p:__str.substring(0,200),
    a:typeof globalThis.__lastDecryptedJSON==='string'?globalThis.__lastDecryptedJSON.length:-1
}};
if(typeof globalThis.__lastDecryptedJSON==='string'&&globalThis.__lastDecryptedJSON.length>0){{
    diag.d0=globalThis.__lastDecryptedJSON.substring(0,300);
    diag.d1=globalThis.__lastDecryptedJSON.substring(0,1000);
}}
globalThis.java.log('DIAG|final|'+JSON.stringify(diag));
return __str;
}})()"#,
        wrapped
    );

    match rt.execute_script("rule_script", wrapper) {
        Ok(global) => {
            let context_global = rt.main_context();
            let scope_storage = v8::HandleScope::new(rt.v8_isolate());
            let scope = std::pin::pin!(scope_storage);
            let mut scope = scope.init();
            let context_local = v8::Local::new(&mut scope, context_global);
            let mut context_scope = v8::ContextScope::new(&mut scope, context_local);
            let local = v8::Local::new(&mut context_scope, global);
            let result = match local.to_string(&context_scope) {
                Some(s) => s.to_rust_string_lossy(&context_scope),
                None => String::new(),
            };
            Ok(result)
        }
        Err(e) => Err(format!("执行失败: {}", e)),
    }
}
