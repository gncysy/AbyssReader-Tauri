// ============================================
// crypto_api — 组装 java.xxx 加密方法
// ============================================
(function(root) {
    var j = globalThis.java;

    var TE = typeof TextEncoder !== 'undefined' ? TextEncoder : function() {};
    if (typeof TextEncoder === 'undefined') {
        TE.prototype.encode = function(str) {
            var bytes = [];
            for (var i = 0; i < str.length; i++) {
                var code = str.charCodeAt(i);
                if (code < 0x80) { bytes.push(code); }
                else if (code < 0x800) { bytes.push(0xc0 | (code >> 6)); bytes.push(0x80 | (code & 0x3f)); }
                else { bytes.push(0xe0 | (code >> 12)); bytes.push(0x80 | ((code >> 6) & 0x3f)); bytes.push(0x80 | (code & 0x3f)); }
            }
            return bytes;
        };
        globalThis.TextEncoder = TE;
    }
    if (typeof TextDecoder === 'undefined') {
        var TD = function() {};
        TD.prototype.decode = function(bytes) {
            if (!bytes || bytes.length === 0) return '';
            var str = '';
            var i = 0;
            while (i < bytes.length) {
                var b = bytes[i];
                if (b < 0x80) { str += String.fromCharCode(b); i += 1; }
                else if ((b & 0xe0) === 0xc0) { str += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i+1] & 0x3f)); i += 2; }
                else { str += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i+1] & 0x3f) << 6) | (bytes[i+2] & 0x3f)); i += 3; }
            }
            return str;
        };
        globalThis.TextDecoder = TD;
    }

    j.md5Encode = function(str) { return Deno.core.ops.op_java_md5_encode(String(str)); };
    j.md5Encode16 = function(str) { var full = j.md5Encode(str); return full.substring(8, 24); };

    j.base64Encode = function(str, flags) { return Deno.core.ops.op_java_base64_encode(String(str)); };
    j.base64Decode = function(str, charsetOrFlags) { return Deno.core.ops.op_java_base64_decode(String(str)); };
    j.base64DecodeToByteArray = function(str, flags) { var d = j.base64Decode(str); return new TextEncoder().encode(d); };

    j.hexEncode = function(str) { var b = new TextEncoder().encode(String(str)); return Array.from(b).map(function(x){return x.toString(16).padStart(2,'0');}).join(''); };
    j.hexEncodeToString = function(str) { return j.hexEncode(str); };
    j.hexDecodeToString = function(hex) {
        if (!/^[0-9a-fA-F]+$/.test(hex)) return hex;
        var b = new Uint8Array(hex.length/2);
        for(var i=0;i<hex.length;i+=2) b[i/2]=parseInt(hex.substring(i,i+2),16);
        return new TextDecoder().decode(b);
    };
    j.hexDecodeToByteArray = function(hex) {
        if (!/^[0-9a-fA-F]+$/.test(hex)) return new Uint8Array();
        var b = new Uint8Array(hex.length/2);
        for(var i=0;i<hex.length;i+=2) b[i/2]=parseInt(hex.substring(i,i+2),16);
        return b;
    };

    j.sha1 = function(str) { return root.__sha1Hex(str); };
    j.sha256 = function(str) { return root.__sha256Hex(str); };
    j.sha512 = function(str) { return root.__sha512Hex(str); };
    j.md5 = function(str) { return root.__md5Hex(str); };

    j.hmacSha256 = function(str, key) { return root.__hmacSha256Hex(str, key); };
    j.hmacHex = function(str, key, algo) { return root.__hmacSha256Hex(str, key); };
    j.HMacHex = function(data, algorithm, key) { return root.__hmacSha256Hex(data, key); };
    j.HMacBase64 = function(data, algorithm, key) { var hex = root.__hmacSha256Hex(data, key); return j.base64Encode(hex); };

    j.digestHex = function(str, algo) {
        var a = String(algo||'').toUpperCase();
        if (a === 'SHA-1' || a === 'SHA1') return root.__sha1Hex(str);
        if (a === 'SHA-512' || a === 'SHA512') return root.__sha512Hex(str);
        if (a === 'MD5') return root.__md5Hex(str);
        return root.__sha256Hex(str);
    };
    j.digestBase64Str = function(data, algorithm) { var hex = j.digestHex(data, algorithm); return j.base64Encode(hex); };

    // ---- 内部辅助：创建对称加密实例 ----
    function _makeSym(algorithm, key, iv) {
        var algo = String(algorithm).toUpperCase();
        var isEcb = algo.indexOf('ECB') !== -1;
        var isCBC = algo.indexOf('CBC') !== -1;
        var isDes = algo.indexOf('DES') !== -1;
        var isTriple = algo.indexOf('DESEDE') !== -1 || algo.indexOf('3DES') !== -1 || algo.indexOf('TRIPLEDES') !== -1;
        var isAes = algo.indexOf('AES') !== -1;
        var mode = isCBC ? 'CBC' : 'ECB';
        var keyBytes = Array.from(new TextEncoder().encode(String(key)));
        var ivBytes = iv ? Array.from(new TextEncoder().encode(String(iv))) : null;

        if (isDes && !isTriple && isCBC && iv) {
            return {
                decryptStr: function(data) { return Deno.core.ops.op_java_des_base64_decode(String(data), String(key) + '::' + String(iv)); },
                encryptStr: function(data) { var dataBytes = Array.from(new TextEncoder().encode(String(data))); var kBytes = keyBytes.length >= 8 ? keyBytes.slice(0,8) : keyBytes.concat(new Array(8-keyBytes.length).fill(0)); var ivB = ivBytes || []; var enc = root.__desEncrypt(dataBytes, kBytes, ivB, 'CBC'); return root.__bytesToBase64(enc); },
                encryptBase64: function(data) { return this.encryptStr(data); },
                decrypt: function(data) { return this.decryptStr(data); },
                encrypt: function(data) { return this.encryptStr(data); }
            };
        }
        if (isAes && isCBC && !isEcb) {
            return {
                decryptStr: function(data) { return Deno.core.ops.op_java_aes_base64_decode(String(data), String(key) + '::' + String(iv || '')); },
                encryptStr: function(data) { var dataBytes = Array.from(new TextEncoder().encode(String(data))); var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0)); var ivB = ivBytes || []; var enc = root.__aesEncrypt(dataBytes, kBytes, ivB, 'CBC'); return root.__bytesToBase64(enc); },
                encryptBase64: function(data) { return this.encryptStr(data); },
                decrypt: function(data) { return this.decryptStr(data); },
                encrypt: function(data) { return this.encryptStr(data); }
            };
        }
        if (isAes && isEcb) {
            return {
                encryptStr: function(data) { var dataBytes = Array.from(new TextEncoder().encode(String(data))); var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0)); var enc = root.__aesEncrypt(dataBytes, kBytes, [], 'ECB'); return root.__bytesToBase64(enc); },
                decryptStr: function(data) { var dataBytes = root.__base64ToBytes(String(data)); var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0)); var dec = root.__aesDecrypt(dataBytes, kBytes, [], 'ECB'); return new TextDecoder().decode(new Uint8Array(dec)); },
                encryptBase64: function(data) { return this.encryptStr(data); },
                decrypt: function(data) { return this.decryptStr(data); },
                encrypt: function(data) { return this.encryptStr(data); }
            };
        }
        if (isAes && isCBC) {
            return {
                encryptStr: function(data) { var dataBytes = Array.from(new TextEncoder().encode(String(data))); var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0)); var ivB = ivBytes || []; var enc = root.__aesEncrypt(dataBytes, kBytes, ivB, 'CBC'); return root.__bytesToBase64(enc); },
                decryptStr: function(data) { var dataBytes = root.__base64ToBytes(String(data)); var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0)); var ivB = ivBytes || []; var dec = root.__aesDecrypt(dataBytes, kBytes, ivB, 'CBC'); return new TextDecoder().decode(new Uint8Array(dec)); },
                encryptBase64: function(data) { return this.encryptStr(data); },
                decrypt: function(data) { return this.decryptStr(data); },
                encrypt: function(data) { return this.encryptStr(data); }
            };
        }
        if (isTriple) {
            var kBytes24 = keyBytes.length >= 24 ? keyBytes.slice(0,24) : keyBytes.concat(keyBytes.slice(0,24-keyBytes.length));
            return {
                encryptStr: function(data) { var dataBytes = Array.from(new TextEncoder().encode(String(data))); var ivB = isCBC && ivBytes && ivBytes.length >= 8 ? ivBytes.slice(0,8) : null; var enc = root.__tripleDesEncrypt(dataBytes, kBytes24, ivB, mode); return root.__bytesToBase64(enc); },
                decryptStr: function(data) { var dataBytes = root.__base64ToBytes(String(data)); var ivB = isCBC && ivBytes && ivBytes.length >= 8 ? ivBytes.slice(0,8) : null; var dec = root.__tripleDesDecrypt(dataBytes, kBytes24, ivB, mode); return new TextDecoder().decode(new Uint8Array(dec)); },
                encryptBase64: function(data) { return this.encryptStr(data); },
                decrypt: function(data) { return this.decryptStr(data); },
                encrypt: function(data) { return this.encryptStr(data); }
            };
        }
        if (isDes) {
            var kBytes8 = keyBytes.length >= 8 ? keyBytes.slice(0,8) : keyBytes.concat(new Array(8-keyBytes.length).fill(0));
            return {
                encryptStr: function(data) { var dataBytes = Array.from(new TextEncoder().encode(String(data))); var ivB = isCBC && ivBytes && ivBytes.length >= 8 ? ivBytes.slice(0,8) : null; var enc = root.__desEncrypt(dataBytes, kBytes8, ivB, mode); return root.__bytesToBase64(enc); },
                decryptStr: function(data) { var dataBytes = root.__base64ToBytes(String(data)); var ivB = isCBC && ivBytes && ivBytes.length >= 8 ? ivBytes.slice(0,8) : null; var dec = root.__desDecrypt(dataBytes, kBytes8, ivB, mode); return new TextDecoder().decode(new Uint8Array(dec)); },
                encryptBase64: function(data) { return this.encryptStr(data); },
                decrypt: function(data) { return this.decryptStr(data); },
                encrypt: function(data) { return this.encryptStr(data); }
            };
        }
        return { encryptStr: function(d){return d;}, decryptStr: function(d){return d;}, encryptBase64: function(d){return d;}, encrypt: function(d){return d;}, decrypt: function(d){return d;} };
    }

    j.createSymmetricCrypto = _makeSym;

    j.desEncodeToBase64String = function(data, key) {
        var dataBytes = Array.from(new TextEncoder().encode(String(data)));
        var keyBytes = Array.from(new TextEncoder().encode(String(key))).slice(0,8);
        var enc = root.__desEncrypt(dataBytes, keyBytes, [], 'ECB');
        return root.__bytesToBase64(enc);
    };

    // ---- 对齐 @Deprecated 旧版 AES/DES/3DES API ----
    j.aesBase64DecodeToString = function(str, key, transformation, iv) {
        if (transformation && iv) { return _makeSym(transformation, key, iv).decryptStr(str); }
        return Deno.core.ops.op_java_aes_base64_decode(String(str), String(key));
    };
    j.aesDecodeToString = function(str, key, transformation, iv) { return _makeSym(transformation, key, iv).decryptStr(str); };
    j.aesDecodeToByteArray = function(str, key, transformation, iv) { return _makeSym(transformation, key, iv).decrypt(str); };
    j.aesBase64DecodeToByteArray = function(str, key, transformation, iv) { return _makeSym(transformation, key, iv).decrypt(str); };
    j.aesEncodeToString = function(data, key, transformation, iv) { return _makeSym(transformation, key, iv).encryptStr(data); };
    j.aesEncodeToByteArray = function(data, key, transformation, iv) { return _makeSym(transformation, key, iv).encrypt(data); };
    j.aesEncodeToBase64String = function(data, key, transformation, iv) { return _makeSym(transformation, key, iv).encryptBase64(data); };
    j.aesEncodeToBase64ByteArray = function(data, key, transformation, iv) { return _makeSym(transformation, key, iv).encryptBase64(data); };
    j.aesDecodeArgsBase64Str = function(data, key, mode, padding, iv) { return _makeSym('AES/' + mode + '/' + padding, j.base64Decode(key), iv).decryptStr(data); };
    j.aesEncodeArgsBase64Str = function(data, key, mode, padding, iv) { return _makeSym('AES/' + mode + '/' + padding, j.base64Decode(key), iv).encryptBase64(data); };

    j.desDecodeToString = function(data, key, transformation, iv) { return _makeSym(transformation, key, iv).decryptStr(data); };
    j.desBase64DecodeToString = function(data, key, transformation, iv) {
        if (transformation && iv) { return _makeSym(transformation, key, iv).decryptStr(data); }
        return Deno.core.ops.op_java_des_base64_decode(String(data), String(key) + '::' + String(iv || ''));
    };
    j.desEncodeToString = function(data, key, transformation, iv) { return _makeSym(transformation, key, iv).encryptStr(data); };
    j.desEncodeToBase64String = function(data, key, transformation, iv) { return _makeSym(transformation, key, iv).encryptBase64(data); };

    j.tripleDESDecodeStr = function(data, key, mode, padding, iv) { return _makeSym('DESede/' + mode + '/' + padding, key, iv).decryptStr(data); };
    j.tripleDESDecodeArgsBase64Str = function(data, key, mode, padding, iv) { return _makeSym('DESede/' + mode + '/' + padding, j.base64Decode(key), iv).decryptStr(data); };
    j.tripleDESEncodeBase64Str = function(data, key, mode, padding, iv) { return _makeSym('DESede/' + mode + '/' + padding, key, iv).encryptBase64(data); };
    j.tripleDESEncodeArgsBase64Str = function(data, key, mode, padding, iv) { return _makeSym('DESede/' + mode + '/' + padding, j.base64Decode(key), iv).encryptBase64(data); };

    j.createAsymmetricCrypto = function() {
        var sourceKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || 'default';
        return {
            setPublicKey: function(key) { Deno.core.ops.op_java_rsa_set_public_key(String(sourceKey), String(key)); },
            setPrivateKey: function(key) { Deno.core.ops.op_java_rsa_set_private_key(String(sourceKey), String(key)); },
            encryptStr: function(data) { return Deno.core.ops.op_java_rsa_encrypt(String(sourceKey), String(data)); },
            decryptStr: function(data) { return Deno.core.ops.op_java_rsa_decrypt(String(sourceKey), String(data)); }
        };
    };
})(globalThis);
