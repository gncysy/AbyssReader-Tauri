// ============================================
// crypto_api — 组装 java.xxx 加密方法
// ============================================
(function(root) {
    var j = globalThis.java;

    // 优先用 Rust op
    j.md5Encode = function(str) { return Deno.core.ops.op_java_md5_encode(String(str)); };
    j.md5Encode16 = function(str) { var full = j.md5Encode(str); return full.substring(8, 24); };
    j.base64Encode = function(str) { return Deno.core.ops.op_java_base64_encode(String(str)); };
    j.base64Decode = function(str) { return Deno.core.ops.op_java_base64_decode(String(str)); };
    j.base64DecodeToByteArray = function(str) { var d = j.base64Decode(str); return new TextEncoder().encode(d); };
    j.hexEncode = function(str) { var b = new TextEncoder().encode(String(str)); return Array.from(b).map(function(x){return x.toString(16).padStart(2,'0');}).join(''); };
    j.hexEncodeToString = function(str) { return j.hexEncode(str); };
    j.hexDecodeToString = function(hex) { var b=new Uint8Array(hex.length/2); for(var i=0;i<hex.length;i+=2)b[i/2]=parseInt(hex.substring(i,i+2),16); return new TextDecoder().decode(b); };

    // SHA / HMAC — 纯 JS
    j.sha1 = function(str) { return root.__sha1Hex(str); };
    j.sha256 = function(str) { return root.__sha256Hex(str); };
    j.sha512 = function(str) { return root.__sha512Hex(str); };
    j.hmacSha256 = function(str, key) { return root.__hmacSha256Hex(str, key); };
    j.hmacHex = function(str, key, algo) { return root.__hmacSha256Hex(str, key); };
    j.digestHex = function(str, algo) {
        var a = String(algo||'').toUpperCase();
        if (a === 'SHA-1') return root.__sha1Hex(str);
        if (a === 'SHA-512') return root.__sha512Hex(str);
        return root.__sha256Hex(str);
    };
    j.md5 = function(str) { return root.__md5Hex(str); };

    // AES-CBC 优先走 Rust op
    j.aesBase64DecodeToString = function(data, key) {
        return Deno.core.ops.op_java_aes_base64_decode(String(data), String(key));
    };

    // createSymmetricCrypto
    j.createSymmetricCrypto = function(algorithm, key, iv) {
        var algo = String(algorithm).toUpperCase();
        var isEcb = algo.indexOf('ECB') !== -1;
        var isCBC = algo.indexOf('CBC') !== -1;
        var isDes = algo.indexOf('DES') !== -1;
        var isTriple = algo.indexOf('DESEDE') !== -1 || algo.indexOf('3DES') !== -1 || algo.indexOf('TRIPLEDES') !== -1;
        var isAes = algo.indexOf('AES') !== -1;
        var mode = isCBC ? 'CBC' : 'ECB';
        var keyBytes = Array.from(new TextEncoder().encode(String(key)));
        var ivBytes = iv ? Array.from(new TextEncoder().encode(String(iv))) : null;

        if (isAes && isCBC && !isEcb) {
            return {
                decryptStr: function(data) { return Deno.core.ops.op_java_aes_base64_decode(String(data), String(key) + '::' + String(iv || '')); },
                encryptStr: function(data) {
                    var dataBytes = Array.from(new TextEncoder().encode(String(data)));
                    var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0));
                    var ivB = ivBytes || [];
                    var enc = root.__aesEncrypt(dataBytes, kBytes, ivB, 'CBC');
                    return root.__bytesToBase64(enc);
                }
            };
        }
        if (isAes && isEcb) {
            return {
                encryptStr: function(data) {
                    var dataBytes = Array.from(new TextEncoder().encode(String(data)));
                    var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0));
                    var enc = root.__aesEncrypt(dataBytes, kBytes, [], 'ECB');
                    return root.__bytesToBase64(enc);
                },
                decryptStr: function(data) {
                    var dataBytes = root.__base64ToBytes(String(data));
                    var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0));
                    var dec = root.__aesDecrypt(dataBytes, kBytes, [], 'ECB');
                    return new TextDecoder().decode(new Uint8Array(dec));
                }
            };
        }
        if (isAes && isCBC) {
            return {
                encryptStr: function(data) {
                    var dataBytes = Array.from(new TextEncoder().encode(String(data)));
                    var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0));
                    var ivB = ivBytes || [];
                    var enc = root.__aesEncrypt(dataBytes, kBytes, ivB, 'CBC');
                    return root.__bytesToBase64(enc);
                },
                decryptStr: function(data) {
                    var dataBytes = root.__base64ToBytes(String(data));
                    var kBytes = keyBytes.length >= 16 ? keyBytes.slice(0,16) : keyBytes.concat(new Array(16-keyBytes.length).fill(0));
                    var ivB = ivBytes || [];
                    var dec = root.__aesDecrypt(dataBytes, kBytes, ivB, 'CBC');
                    return new TextDecoder().decode(new Uint8Array(dec));
                }
            };
        }
        if (isTriple) {
            var kBytes24 = keyBytes.length >= 24 ? keyBytes.slice(0,24) : keyBytes.concat(keyBytes.slice(0,24-keyBytes.length));
            return {
                encryptStr: function(data) {
                    var dataBytes = Array.from(new TextEncoder().encode(String(data)));
                    var ivB = isCBC && ivBytes && ivBytes.length >= 8 ? ivBytes.slice(0,8) : null;
                    var enc = root.__tripleDesEncrypt(dataBytes, kBytes24, ivB, mode);
                    return root.__bytesToBase64(enc);
                },
                decryptStr: function(data) {
                    var dataBytes = root.__base64ToBytes(String(data));
                    var ivB = isCBC && ivBytes && ivBytes.length >= 8 ? ivBytes.slice(0,8) : null;
                    var dec = root.__tripleDesDecrypt(dataBytes, kBytes24, ivB, mode);
                    return new TextDecoder().decode(new Uint8Array(dec));
                }
            };
        }
        if (isDes) {
            var kBytes8 = keyBytes.length >= 8 ? keyBytes.slice(0,8) : keyBytes.concat(new Array(8-keyBytes.length).fill(0));
            return {
                encryptStr: function(data) {
                    var dataBytes = Array.from(new TextEncoder().encode(String(data)));
                    var ivB = isCBC && ivBytes && ivBytes.length >= 8 ? ivBytes.slice(0,8) : null;
                    var enc = root.__desEncrypt(dataBytes, kBytes8, ivB, mode);
                    return root.__bytesToBase64(enc);
                },
                decryptStr: function(data) {
                    var dataBytes = root.__base64ToBytes(String(data));
                    var ivB = isCBC && ivBytes && ivBytes.length >= 8 ? ivBytes.slice(0,8) : null;
                    var dec = root.__desDecrypt(dataBytes, kBytes8, ivB, mode);
                    return new TextDecoder().decode(new Uint8Array(dec));
                }
            };
        }
        return { encryptStr: function(d){return d;}, decryptStr: function(d){return d;} };
    };

    j.desEncodeToBase64String = function(data, key) {
        var dataBytes = Array.from(new TextEncoder().encode(String(data)));
        var keyBytes = Array.from(new TextEncoder().encode(String(key))).slice(0,8);
        var enc = root.__desEncrypt(dataBytes, keyBytes, [], 'ECB');
        return root.__bytesToBase64(enc);
    };

    // createAsymmetricCrypto — RSA 走 Rust op
    j.createAsymmetricCrypto = function() {
        var sourceKey = (globalThis.__sandbox_data && globalThis.__sandbox_data.source && globalThis.__sandbox_data.source.bookSourceUrl) || 'default';
        return {
            setPublicKey: function(key) {
                Deno.core.ops.op_java_rsa_set_public_key(String(sourceKey), String(key));
            },
            setPrivateKey: function(key) {
                Deno.core.ops.op_java_rsa_set_private_key(String(sourceKey), String(key));
            },
            encryptStr: function(data) {
                return Deno.core.ops.op_java_rsa_encrypt(String(sourceKey), String(data));
            },
            decryptStr: function(data) {
                return Deno.core.ops.op_java_rsa_decrypt(String(sourceKey), String(data));
            }
        };
    };
})(globalThis);
