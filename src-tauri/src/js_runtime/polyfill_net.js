// ============================================
// polyfill_net — ajax, webView, cookie, browser
// ============================================
(function() {
    var j = globalThis.java;

    // ajax(url) / ajax(url, callTimeout)
    j.ajax = function(url, callTimeout) {
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
            if (callTimeout) { autoHeaders['_callTimeout'] = String(callTimeout); }
            urlStr = urlStr + ',{headers:' + JSON.stringify(autoHeaders) + '}';
        }
        if (callTimeout && hasOptions) {
            urlStr = urlStr.replace(/,{/, ',{timeout:' + callTimeout + ',');
        }
        var result = '';
        for (var attempt = 0; attempt < retry + 1; attempt++) { result = Deno.core.ops.op_java_ajax(urlStr); if (result && !result.startsWith('error:') && result !== 'error: timeout') break; }
        if (bodyJs && result && !result.startsWith('error:')) { try { var fn = new Function('result', 'return (' + bodyJs + ')(result);'); var processed = fn(result); if (processed !== null && processed !== undefined) result = String(processed); } catch(e) {} }
        try { j.saveCookies(); } catch(e) {}
        return result;
    };

    // ajaxAll(urlList) / ajaxAll(urlList, skipRateLimit)
    j.ajaxAll = function(urlList, skipRateLimit) {
        var urls = Array.isArray(urlList) ? urlList : [urlList];
        var results = [];
        for (var i = 0; i < urls.length; i++) { results.push(j.ajax(urls[i])); }
        return results;
    };

    j.ajaxTestAll = function(urlList, timeout, skipRateLimit) {
        var urls = Array.isArray(urlList) ? urlList : [urlList];
        var results = [];
        for (var i = 0; i < urls.length; i++) { results.push(j.ajax(urls[i], timeout)); }
        return results;
    };

    // connect(urlStr) / connect(urlStr, header) / connect(urlStr, header, callTimeout)
    j.connect = function(urlStr, header, callTimeout) {
        var h = {};
        if (header && typeof header === 'string') {
            try { var parsed = JSON.parse(header.replace(/'/g, '"')); if (parsed && typeof parsed === 'object') { h = parsed; } } catch(e) {}
        } else if (header && typeof header === 'object') {
            h = header;
        }
        var url = String(urlStr);
        if (Object.keys(h).length > 0) { url = url + ',{headers:' + JSON.stringify(h) + '}'; }
        if (callTimeout) { url = url.replace(/,{/, ',{timeout:' + callTimeout + ','); if (url.indexOf(',{') === -1) { url = url + ',{timeout:' + callTimeout + '}'; } }
        var body = j.ajax(url);
        return { body: body, headers: h, statusCode: 200, url: urlStr, raw: body, toString: function() { return body; } };
    };

    // get(url, headers) / get(url, headers, timeout)
    j.get = function(url, headers, timeout) {
        var h = headers || {};
        var urlStr = String(url);
        if (Object.keys(h).length > 0) { urlStr = urlStr + ',{headers:' + JSON.stringify(h) + '}'; }
        if (timeout) { urlStr = urlStr.replace(/,{/, ',{timeout:' + timeout + ','); if (urlStr.indexOf(',{') === -1) { urlStr = urlStr + ',{timeout:' + timeout + '}'; } }
        var result = j.ajax(urlStr);
        return { headers: function(name) { if (name) { return ''; } return {}; }, statusCode: function() { return 200; }, body: function() { return result; }, toString: function() { return result; } };
    };

    // post(url, body, headers) / post(url, body, headers, timeout)
    j.post = function(url, body, headers, timeout) {
        var h = headers || {};
        var bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        var urlStr = String(url) + ',{method:"POST",body:' + JSON.stringify(bodyStr) + ',headers:' + JSON.stringify(h) + '}';
        if (timeout) { urlStr = urlStr.replace(/,{/, ',{timeout:' + timeout + ','); }
        var result = j.ajax(urlStr);
        return { headers: function(name) { if (name) { return ''; } return {}; }, statusCode: function() { return 200; }, body: function() { return result; }, toString: function() { return result; } };
    };

    // head(url, headers) / head(url, headers, timeout)
    j.head = function(url, headers, timeout) {
        var h = headers || {};
        var urlStr = String(url) + ',{method:"HEAD",headers:' + JSON.stringify(h) + '}';
        if (timeout) { urlStr = urlStr.replace(/,{/, ',{timeout:' + timeout + ','); }
        var result = j.ajax(urlStr);
        return { headers: function(name) { if (name) { return ''; } return {}; }, statusCode: function() { return 200; }, body: function() { return ''; }, toString: function() { return result; } };
    };

    // webView(html, url, js) / webView(html, url, js, cacheFirst)
    j.webView = function(html, url, js, cacheFirst) { return Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML'); };
    j.webViewGetSource = function(html, url, js, sourceRegex, cacheFirst, delayTime) { var result = Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML'); if (sourceRegex && result) { try { var match = result.match(new RegExp(sourceRegex)); return match ? match[0] : result; } catch(e) { return result; } } return result; };
    j.webViewGetOverrideUrl = function(html, url, js, regex, cacheFirst, delayTime) { return j.webViewGetSource(html, url, js, regex, cacheFirst, delayTime); };
    j.webJsExecute = function(html, js) { return Deno.core.ops.op_java_web_js(html || '', js || 'document.documentElement.outerHTML'); };

    // cookie
    j.getCookie = function(tag, key) { return Deno.core.ops.op_java_get_cookie(String(tag), key ? String(key) : ''); };
    j.setCookie = function(url, s) { Deno.core.ops.op_java_set_cookie(String(url), String(s)); };
    j.putLoginHeader = function(h) { Deno.core.ops.op_java_put('default', 'loginHeader', String(h)); };
    j.getLoginHeader = function() { return Deno.core.ops.op_java_get('default', 'loginHeader'); };
    j.getLoginInfoMap = function() { var v = Deno.core.ops.op_java_get('default', 'loginHeader'); if (!v) return {}; try { return JSON.parse(v.replace(/^#/, '')); } catch(e) { return {}; } };
    j.putLoginInfo = function(i) { Deno.core.ops.op_java_put('default', 'loginHeader', '#' + i); };
    j.loadCookies = function() { Deno.core.ops.op_java_load_cookies(); };
    j.saveCookies = function() { Deno.core.ops.op_java_save_cookies(); };
    j.loginComplete = function(url, cookieStr) { return Deno.core.ops.op_java_login_complete(String(url), String(cookieStr)); };

    // browser
    j.startBrowser = function(url, title, html) { Deno.core.ops.op_java_start_browser(String(url)); };
    j.startBrowserAwait = function(url, title) { return Deno.core.ops.op_java_start_browser_await(String(url), String(title || '')); };
    j.openUrl = function(u) { j.startBrowser(u); };

    globalThis.cookie = {
        getCookie: function(t, k) { return j.getCookie(t, k); },
        getKey: function(t, k) { return j.getCookie(t, k); },
        setCookie: function(u, c) { j.setCookie(u, c); },
        removeCookie: function(u) { j.setCookie(u, ''); }
    };
})();

