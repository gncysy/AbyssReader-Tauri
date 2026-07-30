// ============================================
// polyfill_net — ajax, webView, cookie, browser
// ============================================
(function() {
    var j = globalThis.java;

    j.ajax = function(url) {
        var urlStr = Array.isArray(url) ? String(url[0]) : String(url);
        var bodyJs = null; var retry = 0;
        var hasOptions = urlStr.indexOf(',{') !== -1;
        if (hasOptions) { try { var optStr = urlStr.substring(urlStr.indexOf(',{')+1); var opt = JSON.parse(optStr.replace(/'/g, '"')); if (opt.bodyJs) { bodyJs = opt.bodyJs; delete opt.bodyJs; } if (opt.retry) { retry = parseInt(opt.retry, 10) || 0; } urlStr = urlStr.substring(0, urlStr.indexOf(',{')+1) + JSON.stringify(opt); } catch(e) {} }
        if (!hasOptions) {
            var autoHeaders = {}; var source = globalThis.__sandbox_data?.source;
            if (source) {
                if (source.header) { var headerStr = source.header; if (typeof headerStr === 'string') { try { if (headerStr.startsWith('@js:') || headerStr.startsWith('<js>')) { var jsCode = headerStr.replace(/^@js:\s*/, '').replace(/^<js>/, '').replace(/<\/js>$/, ''); var fn = new Function('source', 'baseUrl', 'result', 'java', 'cookie', jsCode); var hResult = fn(source, source.bookSourceUrl || '', '', j, globalThis.cookie); var parsed = JSON.parse(hResult); if (parsed && typeof parsed === 'object') { Object.assign(autoHeaders, parsed); } } else { var parsed = JSON.parse(headerStr.replace(/'/g, '"')); if (parsed && typeof parsed === 'object') { Object.assign(autoHeaders, parsed); } } } catch(e) {} } }
                try { var baseUrl = source.bookSourceUrl || ''; var cookieStr = globalThis.cookie?.getCookie(baseUrl); if (cookieStr && !autoHeaders['Cookie']) autoHeaders['Cookie'] = cookieStr; } catch(e) {}
                if (!autoHeaders['User-Agent']) autoHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
                if (!autoHeaders['Referer']) autoHeaders['Referer'] = source.bookSourceUrl || '';
            }
            urlStr = urlStr + ',{headers:' + JSON.stringify(autoHeaders) + '}';
        }
        var result = '';
        for (var attempt = 0; attempt < retry + 1; attempt++) { result = Deno.core.ops.op_java_ajax(urlStr); if (result && !result.startsWith('error:') && result !== 'error: timeout') break; }
        if (bodyJs && result && !result.startsWith('error:')) { try { var fn = new Function('result', 'return (' + bodyJs + ')(result);'); var processed = fn(result); if (processed !== null && processed !== undefined) result = String(processed); } catch(e) {} }
        try { j.saveCookies(); } catch(e) {}
        return result;
    };

    j.ajaxAll = function(urlList) { var urls = Array.isArray(urlList) ? urlList : [urlList]; var results = []; for (var i = 0; i < urls.length; i++) { results.push(j.ajax(urls[i])); } return results; };

    j.webView = function(html, url, js) { return Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML'); };
    j.webViewGetSource = function(html, url, js, sourceRegex) { var result = Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML'); if (sourceRegex && result) { try { var match = result.match(new RegExp(sourceRegex)); return match ? match[0] : result; } catch(e) { return result; } } return result; };
    j.webViewGetOverrideUrl = function(html, url, js, regex) { return j.webViewGetSource(html, url, js, regex); };
    j.webJsExecute = function(html, js) { return Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML'); };

    j.getCookie = function(tag, key) { return Deno.core.ops.op_java_get_cookie(String(tag), key?String(key):''); };
    j.setCookie = function(url, s) { Deno.core.ops.op_java_set_cookie(String(url), String(s)); };
    j.putLoginHeader = function(h) { Deno.core.ops.op_java_put('default','loginHeader',String(h)); };
    j.getLoginHeader = function() { return Deno.core.ops.op_java_get('default','loginHeader'); };
    j.getLoginInfoMap = function() { var v=Deno.core.ops.op_java_get('default','loginHeader'); if(!v) return {}; try{return JSON.parse(v.replace(/^#/,''))}catch(e){return {};} };
    j.putLoginInfo = function(i) { Deno.core.ops.op_java_put('default','loginHeader','#'+i); };
    j.loadCookies = function() { Deno.core.ops.op_java_load_cookies(); };
    j.saveCookies = function() { Deno.core.ops.op_java_save_cookies(); };
    j.loginComplete = function(url, cookieStr) { return Deno.core.ops.op_java_login_complete(String(url), String(cookieStr)); };
    j.startBrowser = function(url) { Deno.core.ops.op_java_start_browser(String(url)); };
    j.startBrowserAwait = function(url, title) { return Deno.core.ops.op_java_start_browser_await(String(url), String(title)); };
    j.openUrl = function(u){ j.startBrowser(u); };

    globalThis.cookie = {
        getCookie: function(t,k) { return j.getCookie(t,k); },
        getKey: function(t,k) { return j.getCookie(t,k); },
        setCookie: function(u,c) { j.setCookie(u,c); },
        removeCookie: function(u) { j.setCookie(u,''); }
    };
})();
