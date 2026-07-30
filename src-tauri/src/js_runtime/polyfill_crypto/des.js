// ============================================
// DES + 3DES ECB/CBC — 纯 JS 实现
// ============================================
(function(root) {
    var PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
    var PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
    var IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
    var E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
    var P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
    var IP_INV = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
    var S = [
        [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
        [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
        [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
        [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
        [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
        [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
        [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
        [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
    ];

    function permute(block, table, n) { var r=0; for(var i=0;i<n;i++){r<<=1;if(block&(1<<(64-table[i])))r|=1;} return r; }
    function keySchedule(keyBytes) {
        var k=BigIntToBits(keyBytes);
        var cd=permute(k,PC1,56);
        var keys=[],c=(cd>>>28)&0xfffffff,d=cd&0xfffffff;
        var shifts=[1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
        for(var i=0;i<16;i++){var s=shifts[i];c=((c<<s)|(c>>>(28-s)))&0xfffffff;d=((d<<s)|(d>>>(28-s)))&0xfffffff;keys[i]=permute((c<<28)|d,PC2,48);}
        return keys;
    }

    function desProcess(block, keys, encrypt) {
        var b=permute(block,IP,64);
        var l=(b>>>32)&0xffffffff,r=b&0xffffffff;
        for(var i=0;i<16;i++){
            var k=encrypt?keys[i]:keys[15-i];
            var er=permute(r,E,48);
            var x=er^k;
            var f=0;
            for(var j=0;j<8;j++){
                var b6=(x>>>(42-j*6))&0x3f;
                var row=((b6>>4)&2)|(b6&1);
                var col=(b6>>1)&0xf;
                f=(f<<4)|S[j][row*16+col];
            }
            f=permute(f,P,32);
            var temp=r;
            r=l^f;
            l=temp;
        }
        var combined=((r<<32)|l)>>>0;
        return permute(combined,IP_INV,64);
    }

    function BigIntToBits(b) { var r=0; for(var i=0;i<8;i++){r=(r<<8)|(b[i]||0);} return r>>>0; }

    function desEncryptBlock(blockBytes, keyBytes) {
        var block=BigIntToBits(blockBytes);
        var keys=keySchedule(keyBytes);
        var enc=desProcess(block,keys,true);
        var r=[];for(var i=7;i>=0;i--){r.push((enc>>>(i*8))&0xff);}return r;
    }
    function desDecryptBlock(blockBytes, keyBytes) {
        var block=BigIntToBits(blockBytes);
        var keys=keySchedule(keyBytes);
        var dec=desProcess(block,keys,false);
        var r=[];for(var i=7;i>=0;i--){r.push((dec>>>(i*8))&0xff);}return r;
    }

    function desEncrypt(dataBytes, keyBytes, ivBytes, mode) {
        var blockSize = 8;
        var pad = root.__padPKCS7(dataBytes.slice(), blockSize);
        var isCBC = mode === 'CBC' && ivBytes && ivBytes.length === 8;
        var result = [];
        var prev = ivBytes ? ivBytes.slice() : [];
        for (var i = 0; i < pad.length; i += blockSize) {
            var block = pad.slice(i, i+blockSize);
            if (isCBC) { for (var j = 0; j < blockSize; j++) block[j] ^= prev[j]; }
            var enc = desEncryptBlock(block, keyBytes);
            if (isCBC) prev = enc.slice();
            result = result.concat(enc);
        }
        return result;
    }

    function desDecrypt(dataBytes, keyBytes, ivBytes, mode) {
        var blockSize = 8;
        var isCBC = mode === 'CBC' && ivBytes && ivBytes.length === 8;
        var result = [];
        var prev = ivBytes ? ivBytes.slice() : [];
        for (var i = 0; i < dataBytes.length; i += blockSize) {
            var block = dataBytes.slice(i, i+blockSize);
            var encBlock = block.slice();
            var dec = desDecryptBlock(block, keyBytes);
            if (isCBC) { for (var j = 0; j < blockSize; j++) dec[j] ^= prev[j]; prev = encBlock; }
            result = result.concat(dec);
        }
        return root.__unpadPKCS7(result);
    }

    function tripleDesEncrypt(dataBytes, keyBytes, ivBytes, mode) {
        if (keyBytes.length < 24) return desEncrypt(dataBytes, keyBytes.slice(0,8), ivBytes, mode);
        var k1=keyBytes.slice(0,8),k2=keyBytes.slice(8,16),k3=keyBytes.slice(16,24);
        var tmp = desEncrypt(dataBytes, k1, ivBytes, 'ECB');
        tmp = desDecrypt(tmp, k2, [], 'ECB');
        return desEncrypt(tmp, k3, ivBytes, mode);
    }

    function tripleDesDecrypt(dataBytes, keyBytes, ivBytes, mode) {
        if (keyBytes.length < 24) return desDecrypt(dataBytes, keyBytes.slice(0,8), ivBytes, mode);
        var k1=keyBytes.slice(0,8),k2=keyBytes.slice(8,16),k3=keyBytes.slice(16,24);
        var tmp = desDecrypt(dataBytes, k3, ivBytes, mode);
        tmp = desEncrypt(tmp, k2, [], 'ECB');
        return desDecrypt(tmp, k1, [], 'ECB');
    }

    root.__desEncrypt = desEncrypt;
    root.__desDecrypt = desDecrypt;
    root.__tripleDesEncrypt = tripleDesEncrypt;
    root.__tripleDesDecrypt = tripleDesDecrypt;
})(globalThis);
