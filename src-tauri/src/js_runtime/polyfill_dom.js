// ============================================
// polyfill_dom — jsoup mock, Packages, loadJsLib
// ============================================
(function() {
    function createJsoupFromNode(jsonNode, html) {
        if (!jsonNode) return createEmptyResult();
        if (jsonNode['#text']) return createTextNode(jsonNode['#text']);
        var children = [];
        if (jsonNode.children) { for (var i = 0; i < jsonNode.children.length; i++) { children.push(createJsoupFromNode(jsonNode.children[i], html)); } }
        var attrs = jsonNode.attrs || {};
        var tag = jsonNode.tag || '';
        var self = {
            _tag: tag, _attrs: attrs, _children: children, _html: html,
            select: function(css) { var all = []; function walk(n) { if (n._tag && n._tag !== '#text') { if (matchesSelector(n, css)) all.push(n); } if (n._children) for (var i = 0; i < n._children.length; i++) walk(n._children[i]); } walk(self); return buildElementList(all); },
            text: function() { var t = ''; for (var i = 0; i < children.length; i++) t += children[i].text(); return t; },
            html: function() { var h = '<' + tag; var ks = Object.keys(attrs); for (var i = 0; i < ks.length; i++) h += ' ' + ks[i] + '="' + attrs[ks[i]] + '"'; h += '>'; for (var i = 0; i < children.length; i++) h += children[i].html(); h += '</' + tag + '>'; return h; },
            outerHtml: function() { return self.html(); },
            attr: function(n) { return attrs[n] || ''; },
            val: function() { return attrs['value'] || ''; },
            size: function() { return 1; }, first: function() { return self; }, get: function(i) { return children[i] || createEmptyResult(); },
            parents: function() { return createEmptyResult(); }, children: function() { return buildElementList(children); },
            remove: function() {}, nextElementSibling: function() { return createEmptyResult(); },
            toJSON: function() { var obj = { tag: tag }; if (Object.keys(attrs).length > 0) obj.attrs = attrs; var txt = self.text(); if (txt) obj.text = txt; return obj; }
        };
        return self;
    }

    globalThis.Packages = {
        org: {
            jsoup: {
                Jsoup: {
                    parse: function(html) {
                        var raw = Deno.core.ops.op_jsoup_parse(String(html));
                        try {
                            var parsed = JSON.parse(raw);
                            if (parsed && parsed.root) { return createJsoupFromNode(parsed.root, parsed.html); }
                        } catch(e) { }
                        return createEmptyResult();
                    }
                }
            }
        },
        javax: {
            crypto: {
                Cipher: {
                    getInstance: function(algo) {
                        return { init: function() {}, doFinal: function(data) { return data; } };
                    }
                }
            }
        },
        android: {
            util: {
                Base64: {
                    encodeToString: function(d) { return globalThis.java.base64Encode(d); },
                    decode: function(d) { return globalThis.java.base64Decode(d); }
                }
            }
        }
    };

    globalThis.cache = globalThis.java.cache;
    globalThis.org = globalThis.Packages.org;

    globalThis.__loadJsLib = function(source, _java) {
        try {
            var savedJava = _java || globalThis.java;
            var jsLib = source.jsLib;
            if (typeof jsLib === 'string') {
                try { var parsed = JSON.parse(jsLib); if (parsed && typeof parsed === 'object') { var keys = Object.keys(parsed); for (var i = 0; i < keys.length; i++) { var libUrl = parsed[keys[i]]; try { var libCode = savedJava.cacheFile(libUrl); if (!libCode || libCode.length === 0) { try { libCode = savedJava.ajax(libUrl); } catch(e) {} }; if (libCode) (0,eval)(libCode); } catch(e) {} } } }
                catch(e) { try { (0,eval)(jsLib); } catch(e2) {} }
            } else if (jsLib && typeof jsLib === 'object') { var keys = Object.keys(jsLib); for (var i = 0; i < keys.length; i++) { var libUrl = jsLib[keys[i]]; try { var libCode = savedJava.cacheFile(libUrl); if (!libCode || libCode.length === 0) { try { libCode = savedJava.ajax(libUrl); } catch(e) {} }; if (libCode) (0,eval)(libCode); } catch(e) {} } }
            globalThis.java = savedJava;
        } catch(e) {}
    };
})();
