use anyhow::Result;
use deno_core::{JsRuntime, RuntimeOptions};
use std::cell::RefCell;

const POLYFILL_JS: &str = include_str!("polyfill.js");

thread_local! {
    static RUNTIME: RefCell<Option<JsRuntime>> = RefCell::new(None);
}

fn get_or_create_runtime() -> JsRuntime {
    RUNTIME.with(|cell| {
        let mut opt = cell.borrow_mut();
        if let Some(rt) = opt.take() {
            return rt;
        }
        let mut rt = JsRuntime::new(RuntimeOptions::default());
        rt.execute_script("polyfill.js", POLYFILL_JS).ok();
        rt
    })
}

fn return_runtime(rt: JsRuntime) {
    RUNTIME.with(|cell| {
        *cell.borrow_mut() = Some(rt);
    });
}

pub fn execute(code: &str, context_json: &str) -> Result<String, String> {
    let mut rt = get_or_create_runtime();

    let inject = format!("globalThis.__sandbox_data = {};", context_json);
    if let Err(e) = rt.execute_script("inject_context", inject) {
        return_runtime(rt);
        return Err(format!("注入上下文失败: {}", e));
    }

    let wrapped = format!(
        r#"
        (function() {{
            var __data = globalThis.__sandbox_data || {{}};
            var result = __data.result || '';
            var source = __data.source || {{}};
            var baseUrl = __data.baseUrl || '';
            var key = __data.key || '';
            var page = __data.page || 1;
            var book = __data.book || {{}};
            var ret = (function() {{ {} }})();
            if (typeof ret === 'string') ret; else JSON.stringify(ret);
        }})()
        "#,
        code
    );

    // 先把结果转成 String，再还回 runtime
    let result = {
        match rt.execute_script("rule_script", wrapped) {
            Ok(global) => {
                let scope = &mut rt.handle_scope();
                let local = deno_core::v8::Local::new(scope, global);
                Some(local.to_rust_string_lossy(scope))
            }
            Err(e) => return {
                return_runtime(rt);
                Err(format!("执行失败: {}", e))
            },
        }
    };

    return_runtime(rt);
    match result {
        Some(s) => Ok(s),
        None => Err("执行结果为空".into()),
    }
}
