// ============================================
// polyfill_core — DOM 工具 + java 骨架 + storage + utils
// ============================================

function matchesSelector(node, css) {
    if (!node || !node._tag || node._tag === '#text') return false;
    if (css === '*' || css === node._tag) return true;
    if (css.indexOf('.') === 0) { var cls = node._attrs['class'] || ''; return cls.split(' ').indexOf(css.substring(1)) !== -1; }
    if (css.indexOf('#') === 0) { return node._attrs['id'] === css.substring(1); }
    return false;
}

function createEmptyResult() {
    var self = { _items: [], _size: 0,
        size: function() { return 0; }, first: function() { return createEmptyResult(); }, get: function() { return createEmptyResult(); },
        select: function() { return createEmptyResult(); }, text: function() { return ''; }, attr: function() { return ''; },
        html: function() { return ''; }, outerHtml: function() { return ''; }, val: function() { return ''; },
        remove: function() { return createEmptyResult(); },
        parents: function() { return createEmptyResult(); }, children: function() { return createEmptyResult(); },
        add: function() { return createEmptyResult(); }, addAll: function() { return createEmptyResult(); },
        forEach: function() {}, filter: function() { return createEmptyResult(); }, map: function() { return []; },
        eachText: function() { return { size: function() { return 0; }, get: function() { return ''; } }; },
        subList: function() { return createEmptyResult(); }, clear: function() {},
        nextElementSibling: function() { return createEmptyResult(); }, toJSON: function() { return []; }
    };
    return self;
}

function createTextNode(text) {
    var self = { _text: text, _tag: '#text', _attrs: {}, _children: [],
        text: function() { return this._text; }, attr: function() { return ''; }, html: function() { return this._text; },
        outerHtml: function() { return this._text; }, select: function() { return createEmptyResult(); },
        size: function() { return 0; }, first: function() { return createEmptyResult(); }, get: function() { return createEmptyResult(); },
        children: function() { return createEmptyResult(); }, parents: function() { return createEmptyResult(); },
        remove: function() { return createEmptyResult(); },
        val: function() { return ''; }, nextElementSibling: function() { return createEmptyResult(); },
        add: function() { return createEmptyResult(); }, forEach: function() {},
        toJSON: function() { return this._text; }
    };
    return self;
}

function buildElementList(elements) {
    var arr = []; var len = elements.length;
    for (var i = 0; i < len; i++) arr[i] = elements[i];
    arr.length = len;
    arr.size = function() { return len; };
    arr.isEmpty = function() { return len === 0; };
    arr.get = function(i) { return arr[i] || createEmptyResult(); };
    arr.first = function() { return arr[0] || createEmptyResult(); };
    arr.last = function() { return arr[len - 1] || createEmptyResult(); };
    arr.toArray = function() { var r = []; for (var i = 0; i < len; i++) r.push(arr[i]); return r; };
    arr.select = function(sel) {
        var all = [];
        for (var i = 0; i < len; i++) { if (arr[i] && arr[i].select) { var sub = arr[i].select(sel); if (sub && sub._items) { for (var j = 0; j < sub._items.length; j++) all.push(sub._items[j]); } } }
        return buildElementList(all);
    };
    arr.text = function() { var t = ''; for (var i = 0; i < len; i++) t += (arr[i] && arr[i].text ? arr[i].text() : ''); return t; };
    arr.html = function() { var h = ''; for (var i = 0; i < len; i++) h += (arr[i] && arr[i].html ? arr[i].html() : ''); return h; };
    arr.outerHtml = function() { var h = ''; for (var i = 0; i < len; i++) h += (arr[i] && arr[i].outerHtml ? arr[i].outerHtml() : ''); return h; };
    arr.attr = function(name, value) {
        if (value !== undefined) { for (var i = 0; i < len; i++) { if (arr[i] && arr[i].attr) arr[i].attr(name, value); } return arr; }
        return arr[0] && arr[0].attr ? arr[0].attr(name) : '';
    };
    arr.toString = function() { return arr.outerHtml(); };
    arr.eq = function(i) { return elements[i] || createEmptyResult(); };
    arr.eachText = function() { var a = []; for (var i = 0; i < len; i++) a.push(arr[i] && arr[i].text ? arr[i].text() : ''); return { size: function() { return a.length; }, get: function(i) { return a[i] || ''; } }; };
    arr.remove = function(sel) {
        if (sel) { for (var i = 0; i < len; i++) { if (arr[i] && arr[i].select) { var sub = arr[i].select(sel); if (sub && sub._items) { for (var j = 0; j < sub._items.length; j++) { if (sub._items[j] && sub._items[j].remove) sub._items[j].remove(); } } } } return arr; }
        for (var i = 0; i < len; i++) { if (arr[i] && arr[i].remove) arr[i].remove(); }
        return arr;
    };
    arr.parents = function() { return createEmptyResult(); };
    arr.add = function(el) { var n = elements.slice(); if (el && el._items) { for (var i = 0; i < el._items.length; i++) n.push(el._items[i]); } else { n.push(el); } return buildElementList(n); };
    arr.addAll = function(el) { return arr.add(el); };
    arr.forEach = function(fn) { for (var i = 0; i < len; i++) { if (arr[i]) fn.call(arr[i], arr[i], i); } };
    arr.filter = function(fn) { var r = []; for (var i = 0; i < len; i++) { if (fn.call(arr[i], arr[i], i)) r.push(arr[i]); } return buildElementList(r); };
    arr.map = function(fn) { var r = []; for (var i = 0; i < len; i++) { r.push(fn.call(arr[i], arr[i], i)); } return r; };
    arr.toJSON = function() { var r = []; for (var i = 0; i < len; i++) r.push(arr[i] && arr[i].toJSON ? arr[i].toJSON() : ''); return r; };
    return arr;
}

function parseRuleSelector(ruleStr) {
    if (!ruleStr || typeof ruleStr !== 'string') return { css: '', tag: null, attr: null, indexes: null, split: '.' };
    var remaining = ruleStr.trim().replace(/^@+/, '');
    if (remaining.toLowerCase().startsWith('css:')) remaining = remaining.substring(4);
    var attr = null; var lastAt = remaining.lastIndexOf('@');
    if (lastAt > 0) { var after = remaining.substring(lastAt + 1); if (/^(href|src|text|html|content|outerHTML|textNodes|ownText|all|class|id|title|alt|style|width|height|data)$/i.test(after)) { attr = after; remaining = remaining.substring(0, lastAt); } }
    var indexes = null; var split = '.';
    var bracketMatch = remaining.match(/\[([^\]]+)\]$/);
    if (bracketMatch) { var content = bracketMatch[1]; if (content.startsWith('!')) { split = '!'; content = content.substring(1); } indexes = []; var parts = content.split(',').map(function(s) { return s.trim(); }); for (var p = 0; p < parts.length; p++) { var part = parts[p]; if (part.includes(':')) { var segs = part.split(':').map(function(s) { return s.trim(); }); var start = segs[0] ? parseInt(segs[0], 10) : 0; var end = segs[1] ? parseInt(segs[1], 10) : -1; var step = segs[2] ? Math.abs(parseInt(segs[2], 10)) : 1; if (end >= start) for (var i = start; i <= end; i += step) indexes.push(i); else for (var i = start; i >= end; i -= step) indexes.push(i); } else { indexes.push(parseInt(part, 10)); } } remaining = remaining.substring(0, bracketMatch.index); }
    var tag = null; var tagMatch = remaining.match(/@([a-zA-Z][\w-]*)$/);
    if (tagMatch) { tag = tagMatch[1]; remaining = remaining.substring(0, tagMatch.index); }
    var css = remaining.trim().replace(/@class\.([\w-]+)/g, '.$1').replace(/@id\.([\w-]+)/g, '#$1').replace(/@tag\.(\w[\w-]*)/g, '$1').replace(/@/g, '').trim();
    return { css: css, tag: tag, attr: attr, indexes: indexes, split: split };
}

function applyRuleSelector(resultList, parsed) {
    if (!resultList || !resultList._items) return resultList;
    var items = []; var totalLen = resultList._items.length;
    if (parsed.tag) { for (var i = 0; i < totalLen; i++) { var el = resultList._items[i]; var sub = el.select(parsed.tag); if (sub && sub._items) { for (var j = 0; j < sub._items.length; j++) { items.push(sub._items[j]); } } } }
    else { for (var i = 0; i < totalLen; i++) { items.push(resultList._items[i]); } }
    if (parsed.indexes && parsed.indexes.length > 0) { var newTotal = items.length; var selected = []; for (var j = 0; j < parsed.indexes.length; j++) { var idx = parsed.indexes[j]; var actualIndex = idx < 0 ? newTotal + idx : idx; if (actualIndex >= 0 && actualIndex < newTotal) selected.push(items[actualIndex]); } if (parsed.split === '!') { var excluded = []; for (var k = 0; k < items.length; k++) { var found = false; for (var s = 0; s < selected.length; s++) { if (items[k] === selected[s]) { found = true; break; } } if (!found) excluded.push(items[k]); } items = excluded; } else { items = selected; } }
    if (parsed.attr && items.length > 0) { if (parsed.attr === 'text') { return items.map(function(el) { return el.text() || ''; }).join('\n'); } if (parsed.attr === 'html' || parsed.attr === 'outerHTML' || parsed.attr === 'all') { return items.map(function(el) { return el.html() || ''; }).join(''); } return items.map(function(el) { return el.attr(parsed.attr) || ''; }).join('\n'); }
    return buildElementList(items);
}

// ============================================
// java 对象骨架（纯 JS 无加密/无网络部分）
// ============================================
globalThis.java = globalThis.java || {};

// storage & utils（直接在 core 里定义，crypto/net 会追加方法）
Object.assign(globalThis.java, {
    put: function(key, value) { return Deno.core.ops.op_java_put('default', String(key), String(value)); },
    get: function(key) { return Deno.core.ops.op_java_get('default', String(key)); },

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

    reGetBook: function() {}, refreshTocUrl: function() {},
    Map: function(key) { return ''; },
    queryTTF: function() { return null; }, replaceFont: function(t) { return t; }, toNumChapter: function(s) { return s; }, htmlFormat: function(s) { return s; },
    getReadBookConfig: function() { return '{}'; }, getThemeMode: function() { return '0'; }, getThemeConfig: function() { return '{}'; },

    eventListener: false, on: function(){}, emit: function(){}, readBookConfig: {},
    upLoginData: function(i){ Deno.core.ops.op_java_up_login_data(String(i)); },
    refreshExplore: function(){}, refreshBookInfo: function(){},
    showBrowser: function(){},
    showPhoto: function(src){ Deno.core.ops.op_java_show_photo(String(src)); },
    openVideoPlayer: function(url, title) { return Deno.core.ops.op_java_open_video_player(String(url), String(title || '')); },
    downloadFile: function(url) { return Deno.core.ops.op_java_download_file(String(Array.isArray(url) ? url[0] : url)); },
    getVerificationCode: function(svg){ return Deno.core.ops.op_java_get_verification_code(String(svg)); },
    openUrl: function(u){ globalThis.java.startBrowser(u); },
    searchBook: function(k,s){ window.__search_event = { keyword: k, source: s }; Deno.core.ops.op_java_search_book(String(k), JSON.stringify(s)); },
    copyText: function(t){ Deno.core.ops.op_java_copy_text(String(t)); }
});

