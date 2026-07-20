// ============================================
// Legado AnalyzeRule 完整 polyfill
// java = AnalyzeRule 实例，包含所有方法
// ============================================

globalThis.java = {
    // ─── 核心：AJAX 请求（走 Rust reqwest）───
    ajax: function(url) {
        var urlStr = Array.isArray(url) ? String(url[0]) : String(url);
        return Deno.core.ops.op_java_ajax(urlStr);
    },

    // ─── 存储（按书源隔离）───
    put: function(key, value) {
        return Deno.core.ops.op_java_put('default', String(key), String(value));
    },
    get: function(key) {
        return Deno.core.ops.op_java_get('default', String(key));
    },

    // ─── 加密 ───
    md5Encode: function(str) {
        return Deno.core.ops.op_java_md5_encode(String(str));
    },
    md5Encode16: function(str) {
        var full = globalThis.java.md5Encode(str);
        return full.substring(8, 24);
    },
    base64Encode: function(str) {
        return Deno.core.ops.op_java_base64_encode(String(str));
    },
    base64Decode: function(str) {
        return Deno.core.ops.op_java_base64_decode(String(str));
    },
    base64DecodeToByteArray: function(str) {
        var decoded = globalThis.java.base64Decode(str);
        return new TextEncoder().encode(decoded);
    },
    aesBase64DecodeToString: function(data, key) {
        return Deno.core.ops.op_java_aes_base64_decode(String(data), String(key));
    },
    hexEncode: function(str) {
        var bytes = new TextEncoder().encode(String(str));
        return Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
    },
    hexEncodeToString: function(str) { return globalThis.java.hexEncode(str); },
    hexDecodeToString: function(hex) {
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
        return new TextDecoder().decode(bytes);
    },

    // ─── URL 编码 ───
    encodeURI: function(str) {
        return encodeURIComponent(String(str));
    },
    decodeURI: function(str) {
        return decodeURIComponent(String(str));
    },

    // ─── 时间 ───
    timeFormat: function(ts) {
        return Deno.core.ops.op_java_time_format(Number(ts));
    },

    // ─── UUID ───
    randomUUID: function() {
        return Deno.core.ops.op_java_random_uuid();
    },

    // ─── 字节转换 ───
    strToBytes: function(str) {
        return new TextEncoder().encode(String(str));
    },
    bytesToStr: function(bytes) {
        return new TextDecoder().decode(bytes);
    },
    getByteArray: function(data) {
        if (typeof data === 'string') return new TextEncoder().encode(data);
        return new Uint8Array();
    },

    // ─── Cookie ───
    getCookie: function(tag, key) {
        return Deno.core.ops.op_java_get_cookie(String(tag), key ? String(key) : '');
    },
    setCookie: function(url, cookieStr) {
        Deno.core.ops.op_java_set_cookie(String(url), String(cookieStr));
    },

    // ─── 工具 ───
    log: function(msg) {
        console.log('[SourceJS]', msg);
        return msg;
    },
    toast: function(msg) {
        console.log('[Toast]', msg);
        return msg;
    },
    startBrowser: function(url) {
        Deno.core.ops.op_java_start_browser(String(url));
    },
    androidId: function() {
        return 'abyss-reader-android-id';
    },
    getWebViewUA: function() {
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    },

    // ─── 繁简转换（占位）───
    t2s: function(text) { return text; },
    s2t: function(text) { return text; },

    // ─── 对称加密（占位）───
    createSymmetricCrypto: function(algorithm, key, iv) {
        return {
            encryptStr: function(data) { return data; },
            decryptStr: function(data) { return data; },
        };
    },
    createAsymmetricCrypto: function() {
        return {
            setPublicKey: function() {},
            setPrivateKey: function() {},
            encryptStr: function(data) { return data; },
            decryptStr: function(data) { return data; },
        };
    },

    // ─── DES（占位）───
    desEncodeToBase64String: function(data, key) { return data; },

    // ─── Map 模拟 ───
    Map: function(key) { return ''; },

    // ─── 登录 Header 持久化 ───
    putLoginHeader: function(header) {
        Deno.core.ops.op_java_put('default', 'loginHeader', String(header));
    },
    getLoginHeader: function() {
        return Deno.core.ops.op_java_get('default', 'loginHeader');
    },
    getLoginInfoMap: function() {
        var val = Deno.core.ops.op_java_get('default', 'loginHeader');
        if (!val) return {};
        try { return JSON.parse(val.replace(/^#/, '')); } catch(e) { return {}; }
    },
    putLoginInfo: function(info) {
        Deno.core.ops.op_java_put('default', 'loginHeader', '#' + info);
    },

    // ─── source 对象（书源元信息访问）───
    source: {
        setVariable: function(key, value) {
            return globalThis.java.put(key, value);
        },
        getVariable: function(key) {
            return globalThis.java.get(key);
        },
        getKey: function() {
            return Deno.core.ops.op_java_get('default', 'bookSourceUrl');
        },
        getTag: function() {
            return Deno.core.ops.op_java_get('default', 'bookSourceName');
        },
        putLoginHeader: function(header) {
            globalThis.java.putLoginHeader(header);
        },
        getLoginHeader: function() {
            return globalThis.java.getLoginHeader();
        },
    },

    // ─── cache 对象 ───
    cache: {
        _store: {},
        get: function(key) { return this._store[key] || null; },
        put: function(key, value, ttl) { this._store[key] = value; },
        delete: function(key) { delete this._store[key]; },
        clear: function() { this._store = {}; },
    },
    cacheFile: function(url, saveTime) {
        return globalThis.java.ajax(url);
    },
    importScript: function(path) {
        if (path.startsWith('http')) return globalThis.java.ajax(path);
        return '';
    },

    // ─── 事件（占位）───
    eventListener: false,
    on: function() {},
    emit: function() {},
};

// ─── cookie 全局对象 ───
globalThis.cookie = {
    getCookie: function(tag, key) {
        return globalThis.java.getCookie(tag, key);
    },
    getKey: function(tag, key) {
        return globalThis.java.getCookie(tag, key);
    },
    setCookie: function(url, cookieStr) {
        globalThis.java.setCookie(url, cookieStr);
    },
    removeCookie: function(url) {
        globalThis.java.setCookie(url, '');
    },
};

// ─── Packages 模拟 ───
globalThis.Packages = {
    org: {
        jsoup: {
            Jsoup: {
                parse: function(html) {
                    return Deno.core.ops.op_jsoup_parse(String(html));
                },
            },
        },
    },
    javax: {
        crypto: {
            Cipher: {
                getInstance: function() {
                    return {
                        init: function() {},
                        doFinal: function(data) { return data; },
                    };
                },
            },
        },
    },
    android: {
        util: {
            Base64: {
                encodeToString: function(data) { return globalThis.java.base64Encode(data); },
                decode: function(data) { return globalThis.java.base64Decode(data); },
            },
        },
    },
};

// ─── cache 全局对象 ───
globalThis.cache = globalThis.java.cache;
