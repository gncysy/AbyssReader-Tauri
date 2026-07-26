// ============================================
// V8 兼容性转换器
// AST 级修复已由 Rust 端 oxc 处理
// 此文件仅保留 jsLib 加载器
// ============================================

// jsLib 加载器
globalThis.__loadJsLib = function(source, _java) {
    if (!source || typeof source !== 'object') return;
    try {
        var savedJava = _java || globalThis.java;
        var jsLib = source.jsLib;
        if (!jsLib) return;
        if (typeof jsLib === 'string') {
            try {
                var parsed = JSON.parse(jsLib);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    var keys = Object.keys(parsed);
                    for (var i = 0; i < Math.min(keys.length, 100); i++) {
                        try {
                            var libCode = savedJava.cacheFile(parsed[keys[i]]);
                            if (libCode) eval(libCode);
                        } catch(e) {}
                    }
                }
            } catch(e) {
                try { eval(jsLib); } catch(e2) {}
            }
        }
        globalThis.java = savedJava;
    } catch(e) {}
};
