// ============================================
// polyfill_core — java 骨架 + storage + utils
// 不依赖 DOM，纯 API 层
// ============================================

globalThis.java = globalThis.java || {};
globalThis.__dictMemoryCache = globalThis.__dictMemoryCache || {};

Object.assign(globalThis.java, {
    put: function(key, value) { return Deno.core.ops.op_java_put('default', String(key), String(value)); },
    get: function(key) { return Deno.core.ops.op_java_get('default', String(key)); },

    encodeURI: function(str, enc) { try { return encodeURIComponent(String(str)); } catch(e) { return ''; } },
    decodeURI: function(str) { return decodeURIComponent(String(str)); },

    timeFormat: function(ts) { return Deno.core.ops.op_java_time_format(Number(ts)); },
    randomUUID: function() { return Deno.core.ops.op_java_random_uuid(); },

    strToBytes: function(str, charset) { return new TextEncoder().encode(String(str)); },
    bytesToStr: function(bytes, charset) { return new TextDecoder().decode(bytes); },
    getByteArray: function(data) { if (typeof data === 'string') return new TextEncoder().encode(data); return new Uint8Array(); },

    t2s: function(text) { return Deno.core.ops.op_java_t2s(String(text)); },
    s2t: function(text) { return Deno.core.ops.op_java_s2t(String(text)); },

    androidId: function() { return 'abyss-reader-android-id'; },
    getWebViewUA: function() { return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'; },

    log: function(msg) { Deno.core.ops.op_java_emit_log('info', String(msg)); return msg; },
    toast: function(msg) { Deno.core.ops.op_java_emit_log('warn', String(msg)); return msg; },
    longToast: function(msg) { Deno.core.ops.op_java_emit_log('error', String(msg)); return msg; },

    htmlFormat: function(str) {
        if (!str) return '';
        return String(str)
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"');
    },

    setContent: function(html, baseUrl) {
        globalThis.__sandbox_data = globalThis.__sandbox_data || {};
        globalThis.__sandbox_data.result = html;
        globalThis.__sandbox_data.baseUrl = baseUrl || '';
    },

    source: {
        setVariable: function(k, v) {
            var srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || 'default';
            return Deno.core.ops.op_java_put(srcKey, 'source_' + String(k), String(v));
        },
        getVariable: function(k) {
            var srcKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || 'default';
            return Deno.core.ops.op_java_get(srcKey, 'source_' + String(k));
        },
        getKey: function() { return Deno.core.ops.op_java_get('default', 'bookSourceUrl'); },
        getTag: function() { return Deno.core.ops.op_java_get('default', 'bookSourceName'); },
        putLoginHeader: function(h) { Deno.core.ops.op_java_put('default', 'loginHeader', String(h)); },
        getLoginHeader: function() { return Deno.core.ops.op_java_get('default', 'loginHeader'); },
        getLoginInfoMap: function() {
            var v = Deno.core.ops.op_java_get('default', 'loginHeader');
            if (!v) return {};
            try { return JSON.parse(v.replace(/^#/, '')); } catch(e) { return {}; }
        },
        putLoginInfo: function(i) { Deno.core.ops.op_java_put('default', 'loginHeader', '#' + i); },
        refreshExplore: function() {},
        put: function(k, v) { return Deno.core.ops.op_java_put('default', String(k), String(v)); },
        get: function(k) { return Deno.core.ops.op_java_get('default', String(k)); }
    },

    cache: {
        _store: {},
        get: function(k) { return this._store[k] || null; },
        put: function(k, v) { this._store[k] = v; },
        delete: function(k) { delete this._store[k]; },
        clear: function() { this._store = {}; },
        getFromMemory: function(k) { return globalThis.__dictMemoryCache[k] !== undefined ? globalThis.__dictMemoryCache[k] : null; },
        putMemory: function(k, v) { globalThis.__dictMemoryCache[k] = v; },
        deleteMemory: function(k) { delete globalThis.__dictMemoryCache[k]; }
    },

    cacheFile: function(url, saveTime) { return Deno.core.ops.op_java_cache_file(String(url)); },
    importScript: function(path) { if (path.startsWith('http')) return globalThis.java.cacheFile(path); return ''; },

    // ─── 文件操作（对齐 JsExtensions）───
    readTxtFile: function(path, charsetName) {
        return Deno.core.ops.op_java_read_txt_file(String(path));
    },
    readFile: function(path) {
        var b64 = Deno.core.ops.op_java_read_file_bytes_base64(String(path));
        if (!b64 || b64.startsWith('error:')) return null;
        return b64;
    },
    deleteFile: function(path) {
        var r = Deno.core.ops.op_java_delete_file(String(path));
        return r === 'true';
    },
    getTxtInFolder: function(path) {
        return Deno.core.ops.op_java_get_txt_in_folder(String(path));
    },
    unArchiveFile: function(path) {
        return Deno.core.ops.op_java_unarchive_file(String(path));
    },
    getZipStringContent: function(url, path, charsetName) {
        // url 参数：可能是 http URL 或 hex 字符串
        var data = String(url);
        if (!data.startsWith('http://') && !data.startsWith('https://')) {
            // hex → base64
            try { data = globalThis.java.base64Encode(globalThis.java.hexDecodeToString(data)); } catch(e) {}
        }
        return Deno.core.ops.op_java_zip_content(data, String(path));
    },
    getRarStringContent: function(url, path, charsetName) {
        return globalThis.java.getZipStringContent(url, path, charsetName);
    },
    get7zStringContent: function(url, path, charsetName) {
        return globalThis.java.getZipStringContent(url, path, charsetName);
    },
    getZipByteArrayContent: function(url, path) {
        return globalThis.java.getZipStringContent(url, path);
    },
    getRarByteArrayContent: function(url, path) {
        return globalThis.java.getZipStringContent(url, path);
    },
    get7zByteArrayContent: function(url, path) {
        return globalThis.java.getZipStringContent(url, path);
    },
    // downloadFile(content, url) — 16进制转文件（对齐旧版重载）
    downloadFileHex: function(content, url) {
        try {
            var bytes = [];
            for (var i = 0; i < content.length; i += 2) {
                bytes.push(parseInt(content.substring(i, i + 2), 16));
            }
            return globalThis.java.downloadFile(url);
        } catch(e) { return ''; }
    },

    // ─── 签名（对齐 JsEncodeUtils.createSign）───
    createSign: function(algorithm) {
        var sourceKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || 'default';
        return {
            sign: function(data) {
                return Deno.core.ops.op_java_sign(String(sourceKey), String(data), String(algorithm));
            }
        };
    },

    // ─── toURL（对齐 JsExtensions.toURL）───
    toURL: function(url, baseUrl) {
        try {
            if (baseUrl) { return new URL(url, baseUrl); }
            return new URL(url);
        } catch(e) { return null; }
    },

    timeFormatUTC: function(time, format, sh) {
        try {
            var d = new Date(time);
            d.setHours(d.getHours() + (sh || 0));
            return d.toISOString();
        } catch(e) { return ''; }
    },

    logType: function(any) {
        if (any === null) { globalThis.java.log('null'); return; }
        if (any === undefined) { globalThis.java.log('undefined'); return; }
        globalThis.java.log(typeof any + (any && any.constructor ? ' (' + any.constructor.name + ')' : ''));
    },

    reGetBook: function() {}, refreshTocUrl: function() {},
    Map: function() { return ''; },
    queryTTF: function(data, useCache) {
        try {
            var raw = Deno.core.ops.op_java_query_ttf(String(data));
            var parsed = JSON.parse(raw);
            if (!parsed || parsed.cmap === undefined) return null;

            // 构建 Unicode → GlyphID 正向映射
            var unicodeToGlyph = {};
            for (var i = 0; i < parsed.cmap.length; i++) {
                var pair = parsed.cmap[i];
                unicodeToGlyph[pair[0]] = pair[1];
            }

            // 构建 GlyphData → Unicode 反向映射
            var glyfToUnicode = {};
            if (parsed.glyfMap) {
                for (var i = 0; i < parsed.glyfMap.length; i++) {
                    var entry = parsed.glyfMap[i];
                    glyfToUnicode[entry.data] = entry.cp;
                }
            }

            return {
                _data: parsed,
                getGlyfIdByUnicode: function(unicode) {
                    return unicodeToGlyph[unicode] || 0;
                },
                getGlyfByUnicode: function(unicode) {
                    var gid = unicodeToGlyph[unicode];
                    if (gid === undefined) return null;
                    // 返回 glyf data 用于反向匹配
                    for (var i = 0; i < parsed.glyfMap.length; i++) {
                        if (parsed.glyfMap[i].gid === gid) return parsed.glyfMap[i].data;
                    }
                    return null;
                },
                getUnicodeByGlyf: function(glyfData) {
                    if (!glyfData) return 0;
                    return glyfToUnicode[glyfData] || 0;
                },
                isBlankUnicode: function(unicode) {
                    return unicode === 0x0020 || unicode === 0x00A0 || unicode === 0x3000;
                }
            };
        } catch(e) { return null; }
    },

    replaceFont: function(text, errorQueryTTF, correctQueryTTF, filter) {
        if (!errorQueryTTF || !correctQueryTTF || !text) return text;
        var result = '';
        for (var i = 0; i < text.length; i++) {
            var ch = text.charAt(i);
            var code = ch.codePointAt(0) || ch.charCodeAt(0);

            // 忽略空白字符
            if (errorQueryTTF.isBlankUnicode(code)) {
                result += ch;
                continue;
            }

            // 获取错误字体的 glyf 数据
            var glyf = errorQueryTTF.getGlyfByUnicode(code);

            // 过滤模式：glyf 为空时跳过
            if (filter && !glyf) {
                continue;
            }

            // 用正确字体反查 Unicode
            var newCode = correctQueryTTF.getUnicodeByGlyf(glyf);
            if (newCode !== 0 && newCode !== undefined) {
                result += String.fromCodePoint(newCode);
            } else if (!filter) {
                result += ch;
            }
        }
        return result;
    },

    queryBase64TTF: function(data) {
        return globalThis.java.queryTTF(data, true);
    },
    toNumChapter: function(s) { return s; },
    getReadBookConfig: function() { return '{}'; },
    getThemeMode: function() { return '0'; },
    getThemeConfig: function() { return '{}'; },

    eventListener: false,
    on: function() {}, emit: function() {},
    readBookConfig: {},
    upLoginData: function(i) { Deno.core.ops.op_java_up_login_data(String(i)); },
    refreshExplore: function() {}, refreshBookInfo: function() {},
    showBrowser: function() {},
    showPhoto: function(src) { Deno.core.ops.op_java_show_photo(String(src)); },
    openVideoPlayer: function(url, title, isFloat) { return Deno.core.ops.op_java_open_video_player(String(url), String(title || '')); },
    unzipFile: function(path) { return globalThis.java.unArchiveFile(path); },
    un7zFile: function(path) { return globalThis.java.unArchiveFile(path); },
    unrarFile: function(path) { return globalThis.java.unArchiveFile(path); },
    downloadFile: function(url) { return Deno.core.ops.op_java_download_file(String(Array.isArray(url) ? url[0] : url)); },
    getVerificationCode: function(svg) { return Deno.core.ops.op_java_get_verification_code(String(svg)); },
    openUrl: function(u) { globalThis.java.startBrowser(u); },
    searchBook: function(k, s) { Deno.core.ops.op_java_search_book(String(k), JSON.stringify(s)); },
    copyText: function(t) { Deno.core.ops.op_java_copy_text(String(t)); }
});




