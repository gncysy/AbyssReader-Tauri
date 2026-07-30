// ============================================
// HMAC-SHA256 — 纯 JS 实现
// ============================================
(function(root) {
    function sha256Bytes(data) { return root.__sha256Bytes(data); }

    function hmacSha256Bytes(message, key) {
        var blockSize = 64;
        var keyBytes = typeof key === 'string' ? Array.from(new TextEncoder().encode(key)) : (Array.isArray(key) ? key : []);
        if (keyBytes.length > blockSize) { keyBytes = sha256Bytes(keyBytes); }
        while (keyBytes.length < blockSize) keyBytes.push(0);

        var ipad = [], opad = [];
        for (var i = 0; i < blockSize; i++) { ipad.push(keyBytes[i] ^ 0x36); opad.push(keyBytes[i] ^ 0x5c); }

        var msgBytes = typeof message === 'string' ? Array.from(new TextEncoder().encode(message)) : (Array.isArray(message) ? message : []);
        var inner = sha256Bytes(ipad.concat(msgBytes));
        return sha256Bytes(opad.concat(inner));
    }

    function hmacSha256Hex(message, key) {
        var b = hmacSha256Bytes(message, key);
        var s = ''; for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
        return s;
    }

    root.__hmacSha256Bytes = hmacSha256Bytes;
    root.__hmacSha256Hex = hmacSha256Hex;
})(globalThis);
