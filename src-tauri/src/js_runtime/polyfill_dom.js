// ============================================
// polyfill_dom — 完整 Jsoup DOM API
// 所有对象直接挂 globalThis，无需外部补全
// ============================================

(function() {
    function matchesSelector(node, css) {
        if (!node || !node._tag || node._tag === '#text') return false;
        if (css.indexOf('[') !== -1) {
            var m = css.match(/\[([^=]+)="([^"]+)"\]/);
            if (m) { return (node._attrs && node._attrs[m[1]] === m[2]); }
        }
        if (css === '*' || css === node._tag) return true;
        if (css.indexOf('.') === 0) { var cls = (node._attrs && node._attrs['class']) || ''; return cls.split(' ').indexOf(css.substring(1)) !== -1; }
        if (css.indexOf('#') === 0) { return (node._attrs && node._attrs['id'] === css.substring(1)); }
        return false;
    }

    function createEmptyResult() {
        var self = {
            _items: [], _size: 0,
            size: function() { return 0; }, first: function() { return self; }, get: function() { return self; },
            select: function() { return self; }, text: function() { return ''; }, attr: function() { return ''; },
            html: function() { return ''; }, outerHtml: function() { return ''; }, val: function() { return ''; },
            remove: function() { return self; }, parents: function() { return self; }, children: function() { return self; },
            add: function() { return self; }, addAll: function() { return self; },
            forEach: function() {}, filter: function() { return self; }, map: function() { return []; },
            eachText: function() { return { size: function() { return 0; }, get: function() { return ''; } }; },
            subList: function() { return self; }, clear: function() {},
            nextElementSibling: function() { return self; }, toJSON: function() { return []; },
            toArray: function() { return []; }, isEmpty: function() { return true; },
            eq: function() { return self; }, before: function() { return self; }, after: function() { return self; },
            appendChild: function() { return self; }, appendText: function() { return self; },
            replaceWith: function() {}, selectFirst: function() { return self; }, tagName: function() { return ''; }
        };
        return self;
    }

    function createTextNode(text) {
        return {
            _tag: '#text', _text: text, _attrs: {}, _children: [],
            text: function() { return this._text; }, attr: function() { return ''; },
            html: function() { return this._text; }, outerHtml: function() { return this._text; },
            select: function() { return createEmptyResult(); },
            size: function() { return 0; }, first: function() { return createEmptyResult(); },
            get: function() { return createEmptyResult(); },
            children: function() { return createEmptyResult(); }, parents: function() { return createEmptyResult(); },
            remove: function() { return createEmptyResult(); },
            val: function() { return ''; }, nextElementSibling: function() { return createEmptyResult(); },
            add: function() { return createEmptyResult(); }, forEach: function() {},
            toJSON: function() { return this._text; }, tagName: function() { return '#text'; },
            appendChild: function() { return this; }, appendText: function() { return this; },
            replaceWith: function() {}, selectFirst: function() { return createEmptyResult(); },
            before: function() { return this; }, after: function() { return this; }
        };
    }

    function buildElementList(elements) {
        var len = elements.length;
        var arr = new Array(len);
        for (var i = 0; i < len; i++) arr[i] = elements[i];
        arr._items = elements;
        arr.length = len;
        arr.size = function() { return len; };
        arr.isEmpty = function() { return len === 0; };
        arr.get = function(i) { return arr[i] || createEmptyResult(); };
        arr.first = function() { return arr[0] || createEmptyResult(); };
        arr.last = function() { return arr[len - 1] || createEmptyResult(); };
        arr.toArray = function() { var r = []; for (var i = 0; i < len; i++) r.push(arr[i]); return r; };
        arr.eq = function(i) { return arr[i] || createEmptyResult(); };
        arr.select = function(sel) {
            var all = [];
            for (var i = 0; i < len; i++) {
                if (arr[i] && arr[i].select) {
                    var sub = arr[i].select(sel);
                    if (sub && sub._items) { for (var j = 0; j < sub._items.length; j++) all.push(sub._items[j]); }
                }
            }
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
        arr.eachText = function() { var a = []; for (var i = 0; i < len; i++) a.push(arr[i] && arr[i].text ? arr[i].text() : ''); return { size: function() { return a.length; }, get: function(i) { return a[i] || ''; } }; };
        arr.remove = function(sel) {
            if (sel) {
                for (var i = 0; i < len; i++) {
                    if (arr[i] && arr[i].select) {
                        var sub = arr[i].select(sel);
                        if (sub && sub._items) { for (var j = 0; j < sub._items.length; j++) { if (sub._items[j] && sub._items[j].remove) sub._items[j].remove(); } }
                    }
                }
                return arr;
            }
            for (var i = 0; i < len; i++) { if (arr[i] && arr[i].remove) arr[i].remove(); }
            return arr;
        };
        arr.parents = function() { return createEmptyResult(); };
        arr.children = function() {
            var all = [];
            for (var i = 0; i < len; i++) { if (arr[i] && arr[i].children) { var ch = arr[i].children(); if (ch && ch._items) { for (var j = 0; j < ch._items.length; j++) all.push(ch._items[j]); } } }
            return buildElementList(all);
        };
        arr.add = function(el) { var n = elements.slice(); if (el && el._items) { for (var i = 0; i < el._items.length; i++) n.push(el._items[i]); } else { n.push(el); } return buildElementList(n); };
        arr.addAll = arr.add;
        arr.forEach = function(fn) { for (var i = 0; i < len; i++) { if (arr[i]) fn.call(arr[i], arr[i], i); } };
        arr.filter = function(fn) { var r = []; for (var i = 0; i < len; i++) { if (fn.call(arr[i], arr[i], i)) r.push(arr[i]); } return buildElementList(r); };
        arr.map = function(fn) { var r = []; for (var i = 0; i < len; i++) { r.push(fn.call(arr[i], arr[i], i)); } return r; };
        arr.toJSON = function() { var r = []; for (var i = 0; i < len; i++) r.push(arr[i] && arr[i].toJSON ? arr[i].toJSON() : ''); return r; };
        arr.before = function(html) { for (var i = 0; i < len; i++) { if (arr[i] && arr[i].before) arr[i].before(html); } return arr; };
        arr.after = function(html) { for (var i = 0; i < len; i++) { if (arr[i] && arr[i].after) arr[i].after(html); } return arr; };
        arr.nextElementSibling = function() { return createEmptyResult(); };
        return arr;
    }

    function createJsoupFromNode(jsonNode, html) {
        if (!jsonNode) return createEmptyResult();
        if (jsonNode['#text']) return createTextNode(jsonNode['#text']);
        var children = [];
        if (jsonNode.children) { for (var i = 0; i < jsonNode.children.length; i++) { var c = createJsoupFromNode(jsonNode.children[i], html); c._parent = null; children.push(c); } }
        var attrs = jsonNode.attrs || {};
        var tag = jsonNode.tag || '';

        var self = {
            _tag: tag, _attrs: attrs, _children: children, _html: html, _parent: null,

            select: function(css) {
                var all = [];
                (function walk(n) {
                    if (n._tag && n._tag !== '#text' && matchesSelector(n, css)) all.push(n);
                    if (n._children) for (var i = 0; i < n._children.length; i++) walk(n._children[i]);
                })(self);
                return buildElementList(all);
            },

            selectFirst: function(css) {
                var all = [];
                (function walk(n) {
                    if (all.length > 0) return;
                    if (n._tag && n._tag !== '#text' && matchesSelector(n, css)) all.push(n);
                    if (n._children) for (var i = 0; i < n._children.length; i++) walk(n._children[i]);
                })(self);
                return all.length > 0 ? all[0] : createEmptyResult();
            },

            text: function(val) {
                if (val !== undefined) { children = [createTextNode(val)]; return self; }
                var t = ''; for (var i = 0; i < children.length; i++) t += children[i].text(); return t;
            },

            ownText: function() {
                var t = '';
                for (var i = 0; i < children.length; i++) { if (children[i]._tag === '#text') t += children[i].text(); }
                return t;
            },

            html: function() {
                var h = '<' + tag; var ks = Object.keys(attrs); for (var i = 0; i < ks.length; i++) h += ' ' + ks[i] + '="' + attrs[ks[i]] + '"';
                h += '>'; for (var i = 0; i < children.length; i++) h += children[i].outerHtml(); h += '</' + tag + '>'; return h;
            },

            outerHtml: function() { return this.html(); },

            attr: function(name, value) {
                if (value !== undefined) { attrs[name] = value; return self; }
                return attrs[name] || '';
            },

            val: function() { return attrs['value'] || ''; },
            data: function() { return attrs['data'] || ''; },
            tagName: function() { return tag; },

            size: function() { return 1; },
            first: function() { return self; },
            get: function(i) { return children[i] || createEmptyResult(); },
            eq: function(i) { return children[i] || createEmptyResult(); },

            children: function() { return buildElementList(children); },
            parents: function() { return createEmptyResult(); },
            parent: function() { return self._parent || createEmptyResult(); },

            nextElementSibling: function() {
                if (!self._parent || !self._parent._children) return createEmptyResult();
                var idx = self._parent._children.indexOf(self);
                return (idx >= 0 && idx < self._parent._children.length - 1) ? self._parent._children[idx + 1] : createEmptyResult();
            },

            appendChild: function(child) {
                if (child) { child._parent = self; children.push(child); }
                return self;
            },

            appendText: function(text) {
                children.push(createTextNode(text));
                return self;
            },

            prependChild: function(child) {
                if (child) { child._parent = self; children.unshift(child); }
                return self;
            },

            remove: function() {
                if (self._parent && self._parent._children) {
                    var idx = self._parent._children.indexOf(self);
                    if (idx !== -1) self._parent._children.splice(idx, 1);
                }
                return self;
            },

            replaceWith: function(newEl) {
                if (self._parent && self._parent._children) {
                    var idx = self._parent._children.indexOf(self);
                    if (idx !== -1) { newEl._parent = self._parent; self._parent._children[idx] = newEl; }
                }
            },

            before: function(html) {
                if (self._parent && self._parent._children) {
                    var dummy = typeof html === 'string' ? createTextNode(html) : html;
                    dummy._parent = self._parent;
                    var idx = self._parent._children.indexOf(self);
                    if (idx !== -1) self._parent._children.splice(idx, 0, dummy);
                }
                return self;
            },

            after: function(html) {
                if (self._parent && self._parent._children) {
                    var dummy = typeof html === 'string' ? createTextNode(html) : html;
                    dummy._parent = self._parent;
                    var idx = self._parent._children.indexOf(self);
                    if (idx !== -1) self._parent._children.splice(idx + 1, 0, dummy);
                }
                return self;
            },

            siblings: function() {
                if (!self._parent || !self._parent._children) return createEmptyResult();
                var s = []; for (var i = 0; i < self._parent._children.length; i++) { if (self._parent._children[i] !== self) s.push(self._parent._children[i]); }
                return buildElementList(s);
            },

            forEach: function(fn) { fn(self, 0); },

            toJSON: function() {
                var obj = { tag: tag }; if (Object.keys(attrs).length > 0) obj.attrs = attrs;
                if (children.length > 0) obj.children = []; for (var i = 0; i < children.length; i++) obj.children.push(children[i].toJSON ? children[i].toJSON() : '');
                var t = self.text(); if (t && children.length === 0) obj.text = t;
                return obj;
            },

            toString: function() { return this.outerHtml(); }
        };

        for (var i = 0; i < children.length; i++) { children[i]._parent = self; }
        return self;
    }

    function ElementConstructor(tag) {
        if (!tag) return createEmptyResult();
        return createJsoupFromNode({ tag: tag, attrs: {}, children: [] }, '');
    }

    function ElementsConstructor(initial) {
        if (!initial) return buildElementList([]);
        if (Array.isArray(initial)) return buildElementList(initial);
        if (initial._items) return buildElementList(initial._items);
        return buildElementList([initial]);
    }

    function jsonPathQuery(obj, path) {
        if (!obj || !path) return null;
        var p = path.replace(/^\$\.?/, '');
        var parts = p.split('.');
        var cur = obj;
        for (var pi = 0; pi < parts.length; pi++) {
            var part = parts[pi];
            if (cur === null || cur === undefined) return null;
            var bm = part.match(/^(\w+)\[(\*|\d+)\]$/);
            if (bm) {
                cur = cur[bm[1]];
                if (cur === null || cur === undefined) return null;
                if (bm[2] === '*') return cur;
                cur = cur[parseInt(bm[2])];
            } else if (part.match(/^\[(\*|\d+)\]$/)) {
                if (!Array.isArray(cur)) return null;
                var idx = part.match(/^\[(\*|\d+)\]$/)[1];
                if (idx === '*') return cur;
                cur = cur[parseInt(idx)];
            } else {
                cur = cur[part];
            }
        }
        return cur;
    }

    function JavaImporter() {
        var result = {};
        for (var i = 0; i < arguments.length; i++) {
            var obj = arguments[i];
            if (obj && typeof obj === 'object') {
                var keys = Object.keys(obj);
                for (var k = 0; k < keys.length; k++) {
                    result[keys[k]] = obj[keys[k]];
                }
            }
        }
        return result;
    }

    function parseRuleSelector(ruleStr) {
        if (!ruleStr || typeof ruleStr !== 'string') return { css: '', tag: null, attr: null, indexes: null, split: '.' };
        var remaining = ruleStr.trim().replace(/^@+/, '');
        if (remaining.toLowerCase().startsWith('css:')) remaining = remaining.substring(4);
        var attr = null; var lastAt = remaining.lastIndexOf('@');
        if (lastAt > 0) { var after = remaining.substring(lastAt + 1); if (/^(href|src|text|html|content|outerHTML|textNodes|ownText|all|class|id|title|alt|style|width|height|data)$/i.test(after)) { attr = after; remaining = remaining.substring(0, lastAt); } }
        var indexes = null; var split = '.';
        var bm = remaining.match(/\[([^\]]+)\]$/);
        if (bm) { var content = bm[1]; if (content.startsWith('!')) { split = '!'; content = content.substring(1); } indexes = []; var parts = content.split(',').map(function(s) { return s.trim(); }); for (var p = 0; p < parts.length; p++) { var part = parts[p]; if (part.includes(':')) { var segs = part.split(':').map(function(s) { return s.trim(); }); var start = segs[0] ? parseInt(segs[0], 10) : 0; var end = segs[1] ? parseInt(segs[1], 10) : -1; var step = segs[2] ? Math.abs(parseInt(segs[2], 10)) : 1; if (end >= start) for (var i = start; i <= end; i += step) indexes.push(i); else for (var i = start; i >= end; i -= step) indexes.push(i); } else { indexes.push(parseInt(part, 10)); } } remaining = remaining.substring(0, bm.index); }
        var tag = null; var tm = remaining.match(/@([a-zA-Z][\w-]*)$/);
        if (tm) { tag = tm[1]; remaining = remaining.substring(0, tm.index); }
        var css = remaining.trim().replace(/@class\.([\w-]+)/g, '.$1').replace(/@id\.([\w-]+)/g, '#$1').replace(/@tag\.(\w[\w-]*)/g, '$1').replace(/@/g, '').trim();
        return { css: css, tag: tag, attr: attr, indexes: indexes, split: split };
    }

    function applyRuleSelector(resultList, parsed) {
        if (!resultList || !resultList._items) return resultList;
        var items = []; var totalLen = resultList._items.length;
        if (parsed.tag) { for (var i = 0; i < totalLen; i++) { var el = resultList._items[i]; var sub = el.select(parsed.tag); if (sub && sub._items) { for (var j = 0; j < sub._items.length; j++) items.push(sub._items[j]); } } }
        else { for (var i = 0; i < totalLen; i++) items.push(resultList._items[i]); }
        if (parsed.indexes && parsed.indexes.length > 0) { var nt = items.length; var selected = []; for (var j = 0; j < parsed.indexes.length; j++) { var idx = parsed.indexes[j]; var ai = idx < 0 ? nt + idx : idx; if (ai >= 0 && ai < nt) selected.push(items[ai]); } if (parsed.split === '!') { var excluded = []; for (var k = 0; k < items.length; k++) { var found = false; for (var s = 0; s < selected.length; s++) { if (items[k] === selected[s]) { found = true; break; } } if (!found) excluded.push(items[k]); } items = excluded; } else { items = selected; } }
        if (parsed.attr && items.length > 0) { if (parsed.attr === 'text') { return items.map(function(el) { return el.text() || ''; }).join('\n'); } if (parsed.attr === 'html' || parsed.attr === 'outerHTML' || parsed.attr === 'all') { return items.map(function(el) { return el.html() || ''; }).join(''); } return items.map(function(el) { return el.attr(parsed.attr) || ''; }).join('\n'); }
        return buildElementList(items);
    }

    var Packages = {
        java: { lang: { String: function(s) { return String(s); } } },
        com: {
            jayway: {
                jsonpath: {
                    JsonPath: {
                        using: function(config) {
                            return {
                                parse: function(json) {
                                    var data = typeof json === 'string' ? JSON.parse(json) : json;
                                    return { read: function(path) {
                                        var result = jsonPathQuery(data, path);
                                        if (result === null || result === undefined) { return path.indexOf('[*]') !== -1 || path.indexOf('*') !== -1 ? [] : ''; }
                                        return result;
                                    }};
                                }
                            };
                        }
                    },
                    Configuration: { builder: function() { return { options: function() { return this; }, build: function() { return {}; } }; } },
                    Option: { SUPPRESS_EXCEPTIONS: 'SUPPRESS_EXCEPTIONS' }
                }
            }
        },
        org: {
            jsoup: {
                Jsoup: {
                    parse: function(html) {
                        var raw = Deno.core.ops.op_jsoup_parse(String(html));
                        try { var parsed = JSON.parse(raw); if (parsed && parsed.root) return createJsoupFromNode(parsed.root, parsed.html); }
                        catch(e) { }
                        return createEmptyResult();
                    },
                    connect: function(url) {
                        return {
                            userAgent: function() { return this; }, timeout: function() { return this; }, url: function() { return this; },
                            get: function() { var r = globalThis.java ? globalThis.java.ajax(url || '') : ''; return Packages.org.jsoup.Jsoup.parse(r); }
                        };
                    }
                },
                select: { Elements: ElementsConstructor, Element: ElementConstructor },
                nodes: { Element: ElementConstructor }
            }
        },
        javax: { crypto: { Cipher: { getInstance: function() { return { init: function() {}, doFinal: function(data) { return data; } }; } } } },
        android: { util: { Base64: { encodeToString: function(d) { return globalThis.java.base64Encode(d); }, decode: function(d) { return globalThis.java.base64Decode(d); } } } }
    };

    globalThis.Packages = Packages;
    globalThis.org = Packages.org;
    globalThis.Element = ElementConstructor;
    globalThis.Elements = ElementsConstructor;
    globalThis.JavaImporter = JavaImporter;
    globalThis.cache = globalThis.java ? globalThis.java.cache : {};

    var j = globalThis.java || {};
    j.getString = function(ruleStr, mContent) {
        var result = mContent !== undefined ? mContent : (globalThis.__sandbox_data && globalThis.__sandbox_data.result || '');
        if (!ruleStr) return String(result);
        if (typeof result === 'object' && result !== null && result[ruleStr] !== undefined) return String(result[ruleStr]);
        return String(result);
    };
    j.getStringList = function(rule) {
        var result = (globalThis.__sandbox_data && globalThis.__sandbox_data.result) || '';
        var parsed = parseRuleSelector(rule);
        var doc = Packages.org.jsoup.Jsoup.parse(String(result));
        return applyRuleSelector(doc.select(parsed.css || '*'), parsed);
    };
    j.getElement = function(rule) {
        var result = (globalThis.__sandbox_data && globalThis.__sandbox_data.result) || '';
        var parsed = parseRuleSelector(rule); parsed.indexes = [0];
        var doc = Packages.org.jsoup.Jsoup.parse(String(result));
        var r = applyRuleSelector(doc.select(parsed.css || '*'), parsed);
        if (r && r.size && r.size() > 0) return r.first();
        return r;
    };
    j.getElements = function(rule) {
        var result = (globalThis.__sandbox_data && globalThis.__sandbox_data.result) || '';
        var parsed = parseRuleSelector(rule);
        var doc = Packages.org.jsoup.Jsoup.parse(String(result));
        return applyRuleSelector(doc.select(parsed.css || '*'), parsed);
    };

    globalThis.__loadJsLib = function(source, _java) {
        try {
            var ref = _java || globalThis.java;
            var jsLib = source.jsLib;
            if (typeof jsLib === 'string') {
                try { var parsed = JSON.parse(jsLib); if (parsed && typeof parsed === 'object') { var keys = Object.keys(parsed); for (var i = 0; i < keys.length; i++) { var libUrl = parsed[keys[i]]; try { var libCode = ref.cacheFile(libUrl); if (!libCode || libCode.length === 0) { try { libCode = ref.ajax(libUrl); } catch(e) {} }; if (libCode) (0,eval)(libCode); } catch(e) {} } } }
                catch(e) { try { (0,eval)(jsLib); } catch(e2) {} }
            } else if (jsLib && typeof jsLib === 'object') { var keys = Object.keys(jsLib); for (var i = 0; i < keys.length; i++) { var libUrl = jsLib[keys[i]]; try { var libCode = ref.cacheFile(libUrl); if (!libCode || libCode.length === 0) { try { libCode = ref.ajax(libUrl); } catch(e) {} }; if (libCode) (0,eval)(libCode); } catch(e) {} } }
        } catch(e) {}
    };
})();