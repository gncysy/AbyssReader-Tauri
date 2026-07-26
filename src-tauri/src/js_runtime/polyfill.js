// ============================================
// Legado Java API polyfill — 对齐开源阅读 Rhino 引擎
// 纯净版：仅 Java API 模拟，不含兼容性处理
// 兼容性逻辑见 v8-compat.js
// ============================================

// ── CSS 选择器匹配（用于 Jsoup select）───
function matchesSelector(node, css) {
    if (!node || !node._tag || node._tag === '#text') return false;
    if (css === '*' || css === node._tag) return true;
    if (css.indexOf('.') === 0) { var cls = node._attrs['class'] || ''; return cls.split(' ').indexOf(css.substring(1)) !== -1; }
    if (css.indexOf('#') === 0) { return node._attrs['id'] === css.substring(1); }
    return false;
}

// ── 空结果对象 ──
function createEmptyResult() {
    var self = { _items: [], _size: 0, size: function() { return 0; }, first: function() { return createEmptyResult(); }, get: function() { return createEmptyResult(); }, select: function() { return createEmptyResult(); }, text: function() { return ''; }, attr: function() { return ''; }, outerHtml: function() { return ''; }, val: function() { return ''; }, remove: function() {}, parents: function() { return createEmptyResult(); }, children: function() { return createEmptyResult(); }, eachText: function() { return { size: function() { return 0; }, get: function() { return ''; } }; }, subList: function() { return createEmptyResult(); }, clear: function() {}, nextElementSibling: function() { return createEmptyResult(); }, toJSON: function() { return []; } };
    return self;
}

// ── 文本节点 ──
function createTextNode(text) {
    var self = { _text: text, _tag: '#text', _attrs: {}, _children: [], text: function() { return this._text; }, attr: function() { return ''; }, outerHtml: function() { return this._text; }, select: function() { return createEmptyResult(); }, size: function() { return 0; }, first: function() { return createEmptyResult(); }, get: function() { return createEmptyResult(); }, children: function() { return createEmptyResult(); }, parents: function() { return createEmptyResult(); }, remove: function() {}, val: function() { return ''; }, nextElementSibling: function() { return createEmptyResult(); }, toJSON: function() { return this._text; } };
    return self;
}

// ── 从 Rust op_jsoup_parse 返回的 JSON 构建 Jsoup 对象 ──
function createJsoupFromNode(jsonNode, html) {
    if (!jsonNode) return createEmptyResult();
    if (jsonNode['#text']) return createTextNode(jsonNode['#text']);
    var children = [];
    if (jsonNode.children) { for (var i = 0; i < jsonNode.children.length; i++) { children.push(createJsoupFromNode(jsonNode.children[i], html)); } }
    var attrs = jsonNode.attrs || {};
    var tag = jsonNode.tag || '';
    var self = {
        _tag: tag, _attrs: attrs, _children: children, _html: html,
        select: function(css) { var all = []; function walk(n) { if (n._tag && n._tag !== '#text') { var matched = matchesSelector(n, css); if (matched) { all.push(n); } } if (n._children) for (var i = 0; i < n._children.length; i++) walk(n._children[i]); } walk(self); var r = createEmptyResult(); r._items = all; r._size = all.length; r.size = function() { return r._size; }; r.first = function() { return r._items[0] || createEmptyResult(); }; r.get = function(i) { return r._items[i] || createEmptyResult(); }; r.text = function() { var t = ''; for (var i = 0; i < r._items.length; i++) t += r._items[i].text(); return t; }; r.attr = function(n) { return r._items[0] ? r._items[0].attr(n) : ''; }; r.outerHtml = function() { var h = ''; for (var i = 0; i < r._items.length; i++) h += r._items[i].outerHtml(); return h; }; r.eachText = function() { var a = []; for (var i = 0; i < r._items.length; i++) a.push(r._items[i].text()); return { size: function() { return a.length; }, get: function(i) { return a[i] || ''; } }; }; r.remove = function() {}; r.parents = function() { return createEmptyResult(); }; r.toJSON = function() { var arr = []; for (var i = 0; i < r._items.length; i++) arr.push(r._items[i].toJSON()); return arr; }; return r; },
        text: function() { var t = ''; for (var i = 0; i < children.length; i++) t += children[i].text(); return t; },
        attr: function(n) { return attrs[n] || ''; },
        outerHtml: function() { var h = '<' + tag; var ks = Object.keys(attrs); for (var i = 0; i < ks.length; i++) h += ' ' + ks[i] + '="' + attrs[ks[i]] + '"'; h += '>'; for (var i = 0; i < children.length; i++) h += children[i].outerHtml(); h += '</' + tag + '>'; return h; },
        val: function() { return attrs['value'] || ''; }, size: function() { return 1; }, first: function() { return self; }, get: function(i) { return children[i] || createEmptyResult(); }, parents: function() { return createEmptyResult(); }, remove: function() {},
        children: function() { var r = createEmptyResult(); r._items = children; r._size = children.length; r.size = function() { return r._size; }; r.first = function() { return r._items[0] || createEmptyResult(); }; r.get = function(i) { return r._items[i] || createEmptyResult(); }; r.toJSON = function() { var arr = []; for (var i = 0; i < r._items.length; i++) arr.push(r._items[i].toJSON()); return arr; }; return r; },
        nextElementSibling: function() { return createEmptyResult(); },
        toJSON: function() { var obj = { tag: tag }; if (Object.keys(attrs).length > 0) obj.attrs = attrs; var text = self.text(); if (text) obj.text = text; if (children.length > 0) { obj.children = []; for (var i = 0; i < children.length; i++) obj.children.push(children[i].toJSON()); } return obj; }
    };
    return self;
}

// ── Legado 规则选择器解析：支持 @tag、@class、@id、@attr、@index、[-start:end] ──
function parseRuleSelector(ruleStr) {
    if (!ruleStr || typeof ruleStr !== 'string') return { css: '', tag: null, attr: null, indexes: null, split: '.' };
    var remaining = ruleStr.trim();
    remaining = remaining.replace(/^@+/, '');
    if (remaining.toLowerCase().startsWith('css:')) remaining = remaining.substring(4);
    var attr = null;
    var lastAt = remaining.lastIndexOf('@');
    if (lastAt > 0) { var after = remaining.substring(lastAt + 1); if (/^(href|src|text|html|content|outerHTML|textNodes|ownText|all|class|id|title|alt|style|width|height|data)$/i.test(after)) { attr = after; remaining = remaining.substring(0, lastAt); } }
    var indexes = null; var split = '.';
    var bracketMatch = remaining.match(/\[([^\]]+)\]$/);
    if (bracketMatch) { var content = bracketMatch[1]; if (content.startsWith('!')) { split = '!'; content = content.substring(1); } indexes = []; var parts = content.split(',').map(function(s) { return s.trim(); }); for (var p = 0; p < parts.length; p++) { var part = parts[p]; if (part.includes(':')) { var segs = part.split(':').map(function(s) { return s.trim(); }); var start = segs[0] ? parseInt(segs[0], 10) : 0; var end = segs[1] ? parseInt(segs[1], 10) : -1; var step = segs[2] ? Math.abs(parseInt(segs[2], 10)) : 1; if (end >= start) for (var i = start; i <= end; i += step) indexes.push(i); else for (var i = start; i >= end; i -= step) indexes.push(i); } else { indexes.push(parseInt(part, 10)); } } remaining = remaining.substring(0, bracketMatch.index); }
    var tag = null;
    var tagMatch = remaining.match(/@([a-zA-Z][\w-]*)$/);
    if (tagMatch) { tag = tagMatch[1]; remaining = remaining.substring(0, tagMatch.index); }
    var css = remaining.trim().replace(/@class\.([\w-]+)/g, '.$1').replace(/@id\.([\w-]+)/g, '#$1').replace(/@tag\.(\w[\w-]*)/g, '$1').replace(/@/g, '').trim();
    return { css: css, tag: tag, attr: attr, indexes: indexes, split: split };
}

// ── 对 select 结果应用 tag/attr/index 过滤 ──
function applyRuleSelector(resultList, parsed) {
    if (!resultList || !resultList._items) return resultList;
    var items = []; var totalLen = resultList._items.length;
    if (parsed.tag) { for (var i = 0; i < totalLen; i++) { var el = resultList._items[i]; var sub = el.select(parsed.tag); if (sub && sub._items) { for (var j = 0; j < sub._items.length; j++) { items.push(sub._items[j]); } } } }
    else { for (var i = 0; i < totalLen; i++) { items.push(resultList._items[i]); } }
    if (parsed.indexes && parsed.indexes.length > 0) { var newTotal = items.length; var selected = []; for (var j = 0; j < parsed.indexes.length; j++) { var idx = parsed.indexes[j]; var actualIndex = idx < 0 ? newTotal + idx : idx; if (actualIndex >= 0 && actualIndex < newTotal) selected.push(items[actualIndex]); } if (parsed.split === '!') { var excluded = []; for (var k = 0; k < items.length; k++) { var found = false; for (var s = 0; s < selected.length; s++) { if (items[k] === selected[s]) { found = true; break; } } if (!found) excluded.push(items[k]); } items = excluded; } else { items = selected; } }
    if (parsed.attr && items.length > 0) { if (parsed.attr === 'text') { return items.map(function(el) { return el.text() || ''; }).join('\n'); } if (parsed.attr === 'html' || parsed.attr === 'outerHTML' || parsed.attr === 'all') { return items.map(function(el) { return el.outerHtml() || ''; }).join(''); } return items.map(function(el) { return el.attr(parsed.attr) || ''; }).join('\n'); }
    var r = createEmptyResult();
    r._items = items; r._size = items.length; r.size = function() { return r._size; }; r.first = function() { return r._items[0] || createEmptyResult(); }; r.get = function(i) { return r._items[i] || createEmptyResult(); }; r.text = function() { var t = ''; for (var i = 0; i < r._items.length; i++) t += r._items[i].text(); return t; }; r.attr = function(n) { return r._items[0] ? r._items[0].attr(n) : ''; }; r.outerHtml = function() { var h = ''; for (var i = 0; i < r._items.length; i++) h += r._items[i].outerHtml(); return h; }; r.eachText = function() { var a = []; for (var i = 0; i < r._items.length; i++) a.push(r._items[i].text()); return { size: function() { return a.length; }, get: function(i) { return a[i] || ''; } }; }; r.remove = function() {}; r.parents = function() { return createEmptyResult(); }; r.toJSON = function() { var arr = []; for (var i = 0; i < r._items.length; i++) arr.push(r._items[i].toJSON()); return arr; };
    return r;
}

// ============================================
// java.* API — 对齐开源阅读 Rhino 绑定
// ============================================
globalThis.java = {
    ajax: function(url) {
        var urlStr = Array.isArray(url) ? String(url[0]) : String(url);
        var bodyJs = null; var retry = 0;
        var hasOptions = urlStr.indexOf(',{') !== -1;
        if (hasOptions) { try { var optStr = urlStr.substring(urlStr.indexOf(',{')+1); var opt = JSON.parse(optStr.replace(/'/g, '"')); if (opt.bodyJs) { bodyJs = opt.bodyJs; delete opt.bodyJs; } if (opt.retry) { retry = parseInt(opt.retry, 10) || 0; } urlStr = urlStr.substring(0, urlStr.indexOf(',{')+1) + JSON.stringify(opt); } catch(e) {} }
        if (!hasOptions) {
            var autoHeaders = {}; var source = globalThis.__sandbox_data?.source;
            if (source) {
                if (source.header) { var headerStr = source.header; if (typeof headerStr === 'string') { try { if (headerStr.startsWith('@js:') || headerStr.startsWith('<js>')) { var jsCode = headerStr.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, ''); var fn = new Function('source', 'baseUrl', 'result', 'java', 'cookie', jsCode); var hResult = fn(source, source.bookSourceUrl || '', '', globalThis.java, globalThis.cookie); var parsed = JSON.parse(hResult); if (parsed && typeof parsed === 'object') { Object.assign(autoHeaders, parsed); } } else { var parsed = JSON.parse(headerStr.replace(/'/g, '"')); if (parsed && typeof parsed === 'object') { Object.assign(autoHeaders, parsed); } } } catch(e) {} } }
                try { var baseUrl = source.bookSourceUrl || ''; var cookieStr = globalThis.cookie?.getCookie(baseUrl); if (cookieStr && !autoHeaders['Cookie']) autoHeaders['Cookie'] = cookieStr; } catch(e) {}
                if (!autoHeaders['User-Agent']) autoHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                if (!autoHeaders['Referer']) autoHeaders['Referer'] = source.bookSourceUrl || '';
            }
            urlStr = urlStr + ',{headers:' + JSON.stringify(autoHeaders) + '}';
        }
        var result = '';
        for (var attempt = 0; attempt < retry + 1; attempt++) { result = Deno.core.ops.op_java_ajax(urlStr); if (result && !result.startsWith('error:') && result !== 'error: timeout') break; }
        if (bodyJs && result && !result.startsWith('error:')) { try { var fn = new Function('result', 'return (' + bodyJs + ')(result);'); var processed = fn(result); if (processed !== null && processed !== undefined) result = String(processed); } catch(e) {} }
        try { globalThis.java.saveCookies(); } catch(e) {}
        return result;
    },
    ajaxAll: function(urlList) { var urls = Array.isArray(urlList) ? urlList : [urlList]; var results = []; for (var i = 0; i < urls.length; i++) { results.push(globalThis.java.ajax(urls[i])); } return results; },
    webView: function(html, url, js) { return Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML'); },
    webViewGetSource: function(html, url, js, sourceRegex) { var result = Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML'); if (sourceRegex && result) { try { var match = result.match(new RegExp(sourceRegex)); return match ? match[0] : result; } catch(e) { return result; } } return result; },
    webViewGetOverrideUrl: function(html, url, js, regex) { return globalThis.java.webViewGetSource(html, url, js, regex); },

    put: function(key, value) { return Deno.core.ops.op_java_put('default', String(key), String(value)); },
    get: function(key) { return Deno.core.ops.op_java_get('default', String(key)); },

    md5Encode: function(str) { return Deno.core.ops.op_java_md5_encode(String(str)); },
    md5Encode16: function(str) { var full = globalThis.java.md5Encode(str); return full.substring(8, 24); },
    base64Encode: function(str) { return Deno.core.ops.op_java_base64_encode(String(str)); },
    base64Decode: function(str) { return Deno.core.ops.op_java_base64_decode(String(str)); },
    base64DecodeToByteArray: function(str) { var d = globalThis.java.base64Decode(str); return new TextEncoder().encode(d); },
    aesBase64DecodeToString: function(data, key) { return Deno.core.ops.op_java_aes_base64_decode(String(data), String(key)); },
    hexEncode: function(str) { var b = new TextEncoder().encode(String(str)); return Array.from(b).map(function(x) { return x.toString(16).padStart(2,'0'); }).join(''); },
    hexEncodeToString: function(str) { return globalThis.java.hexEncode(str); },
    hexDecodeToString: function(hex) { var b = new Uint8Array(hex.length/2); for (var i=0;i<hex.length;i+=2) b[i/2]=parseInt(hex.substring(i,i+2),16); return new TextDecoder().decode(b); },
    sha1: function(str) { return globalThis.java.md5Encode(str); },
    sha256: function(str) { return globalThis.java.md5Encode(str); },
    sha512: function(str) { return globalThis.java.md5Encode(str); },
    hmacSha256: function(str, key) { return globalThis.java.md5Encode(str + key); },
    hmacHex: function(str, key, algo) { return globalThis.java.md5Encode(str + key); },
    digestHex: function(str, algo) { return globalThis.java.md5Encode(str); },
    encodeURI: function(str) { return encodeURIComponent(String(str)); },
    decodeURI: function(str) { return decodeURIComponent(String(str)); },

    timeFormat: function(ts) { return Deno.core.ops.op_java_time_format(Number(ts)); },
    randomUUID: function() { return Deno.core.ops.op_java_random_uuid(); },
    strToBytes: function(str) { return new TextEncoder().encode(String(str)); },
    bytesToStr: function(bytes) { return new TextDecoder().decode(bytes); },
    getByteArray: function(data) { if (typeof data==='string') return new TextEncoder().encode(data); return new Uint8Array(); },
    t2s: function(text) { return Deno.core.ops.op_java_t2s(String(text)); },
    s2t: function(text) { return Deno.core.ops.op_java_s2t(String(text)); },
    androidId: function() { return 'abyss-reader-android-id'; },
    getWebViewUA: function() { return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'; },

    getCookie: function(tag, key) { return Deno.core.ops.op_java_get_cookie(String(tag), key?String(key):''); },
    setCookie: function(url, s) { Deno.core.ops.op_java_set_cookie(String(url), String(s)); },
    putLoginHeader: function(h) { Deno.core.ops.op_java_put('default','loginHeader',String(h)); },
    getLoginHeader: function() { return Deno.core.ops.op_java_get('default','loginHeader'); },
    getLoginInfoMap: function() { var v=Deno.core.ops.op_java_get('default','loginHeader'); if(!v) return {}; try{return JSON.parse(v.replace(/^#/,''))}catch(e){return {};} },
    putLoginInfo: function(i) { Deno.core.ops.op_java_put('default','loginHeader','#'+i); },
    loadCookies: function() { Deno.core.ops.op_java_load_cookies(); },
    saveCookies: function() { Deno.core.ops.op_java_save_cookies(); },
    loginComplete: function(url, cookieStr) { return Deno.core.ops.op_java_login_complete(String(url), String(cookieStr)); },
    startBrowser: function(url) { Deno.core.ops.op_java_start_browser(String(url)); },
    startBrowserAwait: function(url, title) { return Deno.core.ops.op_java_start_browser_await(String(url), String(title)); },

    log: function(msg) { Deno.core.ops.op_java_emit_log('info', String(msg)); return msg; },
    toast: function(msg) { Deno.core.ops.op_java_emit_log('warn', String(msg)); return msg; },
    longToast: function(msg) { Deno.core.ops.op_java_emit_log('error', String(msg)); return msg; },

    getString: function(ruleStr, mContent) { var result = mContent || globalThis.__sandbox_data?.result || ''; if (!ruleStr) return String(result); if (typeof result === 'object' && result[ruleStr] !== undefined) return String(result[ruleStr]); return String(result); },
    getStringList: function(rule) { var result = globalThis.__sandbox_data?.result || ''; var parsed = parseRuleSelector(rule); var doc = org.jsoup.Jsoup.parse(String(result)); var css = parsed.css || '*'; var els = doc.select(css); return applyRuleSelector(els, parsed); },
    getElement: function(rule) { var result = globalThis.__sandbox_data?.result || ''; var parsed = parseRuleSelector(rule); parsed.indexes = [0]; var doc = org.jsoup.Jsoup.parse(String(result)); var css = parsed.css || '*'; var els = doc.select(css); var r = applyRuleSelector(els, parsed); if (r && r.size && r.size() > 0) return r.first(); return r; },
    getElements: function(rule) { var result = globalThis.__sandbox_data?.result || ''; var parsed = parseRuleSelector(rule); var doc = org.jsoup.Jsoup.parse(String(result)); var css = parsed.css || '*'; var els = doc.select(css); return applyRuleSelector(els, parsed); },
    setContent: function(html, baseUrl) { globalThis.__sandbox_data.result = html; globalThis.__sandbox_data.baseUrl = baseUrl || ''; },

    source: { setVariable: function(k,v) { return globalThis.java.put(k,v); }, getVariable: function(k) { return globalThis.java.get(k); }, getKey: function() { return Deno.core.ops.op_java_get('default','bookSourceUrl'); }, getTag: function() { return Deno.core.ops.op_java_get('default','bookSourceName'); }, putLoginHeader: function(h) { globalThis.java.putLoginHeader(h); }, getLoginHeader: function() { return globalThis.java.getLoginHeader(); }, getLoginInfoMap: function() { return globalThis.java.getLoginInfoMap(); }, putLoginInfo: function(i) { globalThis.java.putLoginInfo(i); }, refreshExplore: function() {}, put: function(k,v) { return globalThis.java.put(k,v); }, get: function(k) { return globalThis.java.get(k); } },

    cache: { _store: {}, get: function(k) { return this._store[k]||null; }, put: function(k,v,t) { this._store[k]=v; }, delete: function(k) { delete this._store[k]; }, clear: function() { this._store={}; } },
    cacheFile: function(url, saveTime) { return Deno.core.ops.op_java_cache_file(String(url)); },
    importScript: function(path) { if(path.startsWith('http')) return globalThis.java.cacheFile(path); return ''; },

    reGetBook: function() { globalThis.java.log('reGetBook: 桌面端不支持'); },
    refreshTocUrl: function() { globalThis.java.log('refreshTocUrl: 桌面端不支持'); },
    createSymmetricCrypto: function(algorithm, key, iv) { var algo = String(algorithm); if (algo.indexOf('AES/CBC') !== -1) { return { decryptStr: function(data) { return Deno.core.ops.op_java_aes_base64_decode(String(data), String(key) + '::' + String(iv || '')); }, encryptStr: function(data) { return data; } }; } return { encryptStr: function(d){return d;}, decryptStr: function(d){return d;} }; },
    createAsymmetricCrypto: function() { return { setPublicKey: function(){}, setPrivateKey: function(){}, encryptStr: function(d){return d;}, decryptStr: function(d){return d;} }; },
    desEncodeToBase64String: function(data, key) { return data; },
    Map: function(key) { return ''; },
    queryTTF: function(data, useCache) { globalThis.java.log('queryTTF: 桌面端不支持'); return null; },
    replaceFont: function(text, errTTF, corTTF, filter) { return text; },
    toNumChapter: function(s) { return s; },
    htmlFormat: function(str) { return str; },
    getReadBookConfig: function() { return '{}'; },
    getThemeMode: function() { return '0'; },
    getThemeConfig: function() { return '{}'; },

    eventListener: false, on: function(){}, emit: function(){}, readBookConfig: {},
    upLoginData: function(i){ Deno.core.ops.op_java_up_login_data(String(i)); },
    refreshExplore: function(){ Deno.core.ops.op_java_refresh_explore(); },
    refreshBookInfo: function(){ Deno.core.ops.op_java_refresh_book_info(); },
    showBrowser: function(){},
    showPhoto: function(src){ Deno.core.ops.op_java_show_photo(String(src)); },
    openVideoPlayer: function(url, title, isFloat) { return Deno.core.ops.op_java_open_video_player(String(url), String(title || '')); },
    downloadFile: function(url) { return Deno.core.ops.op_java_download_file(String(Array.isArray(url) ? url[0] : url)); },
    getVerificationCode: function(svg){ return Deno.core.ops.op_java_get_verification_code(String(svg)); },
    openUrl: function(u){ globalThis.java.startBrowser(u); },
    searchBook: function(k,s){ window.__search_event = { keyword: k, source: s }; Deno.core.ops.op_java_search_book(String(k), JSON.stringify(s)); },
    copyText: function(t){ Deno.core.ops.op_java_copy_text(String(t)); }
};

// ── 全局对象 ──
globalThis.cookie = { getCookie: function(t,k) { return globalThis.java.getCookie(t,k); }, getKey: function(t,k) { return globalThis.java.getCookie(t,k); }, setCookie: function(u,c) { globalThis.java.setCookie(u,c); }, removeCookie: function(u) { globalThis.java.setCookie(u,''); } };
globalThis.Packages = { org: { jsoup: { Jsoup: { parse: function(html) { var raw = Deno.core.ops.op_jsoup_parse(String(html)); try { var parsed = JSON.parse(raw); if (parsed && parsed.root) { return createJsoupFromNode(parsed.root, parsed.html); } } catch(e) { } return createEmptyResult(); } } } }, javax: { crypto: { Cipher: { getInstance: function(algo) { return { init: function(mode, keySpec, ivSpec) {}, doFinal: function(data) { return data; } }; } } } }, android: { util: { Base64: { encodeToString: function(d) { return globalThis.java.base64Encode(d); }, decode: function(d) { return globalThis.java.base64Decode(d); } } } } };
globalThis.cache = globalThis.java.cache;
globalThis.org = globalThis.Packages.org;
