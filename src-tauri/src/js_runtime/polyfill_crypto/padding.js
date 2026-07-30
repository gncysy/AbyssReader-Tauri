// ============================================
// PKCS7 Padding
// ============================================
(function(root) {
    function padPKCS7(bytes, blockSize) {
        var n = blockSize - (bytes.length % blockSize);
        for (var i = 0; i < n; i++) bytes.push(n);
        return bytes;
    }

    function unpadPKCS7(bytes) {
        if (bytes.length === 0) return bytes;
        var n = bytes[bytes.length - 1];
        if (n < 1 || n > 16) return bytes;
        for (var i = bytes.length - n; i < bytes.length; i++) {
            if (bytes[i] !== n) return bytes;
        }
        return bytes.slice(0, bytes.length - n);
    }

    root.__padPKCS7 = padPKCS7;
    root.__unpadPKCS7 = unpadPKCS7;
})(globalThis);
