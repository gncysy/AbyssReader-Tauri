// ============================================
// Base64 — 纯 JS 实现
// ============================================
(function(root) {
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

    function base64ToBytes(s) {
        s = (s || '').replace(/[^A-Za-z0-9\+\/\=]/g, '');
        var o = [], c1, c2, c3, e1, e2, e3, e4, i = 0;
        while (i < s.length) {
            e1 = B64.indexOf(s[i++]); e2 = B64.indexOf(s[i++]);
            e3 = B64.indexOf(s[i++]); e4 = B64.indexOf(s[i++]);
            c1 = (e1 << 2) | (e2 >> 4);
            c2 = ((e2 & 15) << 4) | (e3 >> 2);
            c3 = ((e3 & 3) << 6) | e4;
            o.push(c1);
            if (e3 !== 64) o.push(c2);
            if (e4 !== 64) o.push(c3);
        }
        return o;
    }

    function bytesToBase64(b) {
        var o = '', i = 0;
        while (i < b.length) {
            var c1 = b[i++], c2 = b[i++], c3 = b[i++];
            var e1 = c1 >> 2, e2 = ((c1 & 3) << 4) | (c2 >> 4),
                e3 = ((c2 & 15) << 2) | (c3 >> 6), e4 = c3 & 63;
            if (isNaN(c2)) e3 = e4 = 64;
            else if (isNaN(c3)) e4 = 64;
            o += B64[e1] + B64[e2] + B64[e3] + B64[e4];
        }
        return o;
    }

    root.__base64ToBytes = base64ToBytes;
    root.__bytesToBase64 = bytesToBase64;
})(globalThis);
