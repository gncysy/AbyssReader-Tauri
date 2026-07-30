// ============================================
// SHA-512 — 纯 JS 实现
// ============================================
(function(root) {
    function utf8ToBytes(str) { return Array.from(new TextEncoder().encode(str)); }
    function fromHex64(hex) { var a=[]; for(var i=0;i<8;i++)a.push(parseInt(hex.substring(i*2,i*2+2),16)||0); return a; }
    function add64(a,b) { var r=[],c=0; for(var i=7;i>=0;i--){var s=(a[i]||0)+(b[i]||0)+c;r[i]=s&0xff;c=s>>8;} return r; }
    function rotr64(a,n){var r=[],bs=Math.floor(n/8),bts=n%8;for(var i=0;i<8;i++){var idx=(i+bs)%8;r[idx]=(a[i]>>>bts)|((a[(i+1)%8]||0)<<(8-bts));r[idx]&=0xff;}return r;}
    function shr64(a,n){var r=[];for(var i=0;i<8;i++){r[i]=i+n/8<8?(a[i+n/8]||0):0;}return r;}
    function xor64(a,b){var r=[];for(var i=0;i<8;i++)r[i]=((a[i]||0)^(b[i]||0))&0xff;return r;}

    var K = ["428a2f98d728ae22","7137449123ef65cd","b5c0fbcfec4d3b2f","e9b5dba58189dbbc","3956c25bf348b538","59f111f1b605d019","923f82a4af194f9b","ab1c5ed5da6d8118","d807aa98a3030242","12835b0145706fbe","243185be4ee4b28c","550c7dc3d5ffb4e2","72be5d74f27b896f","80deb1fe3b1696b1","9bdc06a725c71235","c19bf174cf692694","e49b69c19ef14ad2","efbe4786384f25e3","0fc19dc68b8cd5b5","240ca1cc77ac9c65","2de92c6f592b0275","4a7484aa6ea6e483","5cb0a9dcbd41fbd4","76f988da831153b5","983e5152ee66dfab","a831c66d2db43210","b00327c898fb213f","bf597fc7beef0ee4","c6e00bf33da88fc2","d5a79147930aa725","06ca6351e003826f","142929670a0e6e70","27b70a8546d22ffc","2e1b21385c26c926","4d2c6dfc5ac42aed","53380d139d95b3df","650a73548baf63de","766a0abb3c77b2a8","81c2c92e47edaee6","92722c851482353b","a2bfe8a14cf10364","a81a664bbc423001","c24b8b70d0f89791","c76c51a30654be30","d192e819d6ef5218","d69906245565a910","f40e35855771202a","106aa07032bbd1b8","19a4c116b8d2d0c8","1e376c085141ab53","2748774cdf8eeb99","34b0bcb5e19b48a8","391c0cb3c5c95a63","4ed8aa4ae3418acb","5b9cca4f7763e373","682e6ff3d6b2b8a3","748f82ee5defb2fc","78a5636f43172f60","84c87814a1f0ab72","8cc702081a6439ec","90befffa23631e28","a4506cebde82bde9","bef9a3f7b2c67915","c67178f2e372532b","ca273eceea26619c","d186b8c721c0c207","eada7dd6cde0eb1e","f57d4f7fee6ed178","06f067aa72176fba","0a637dc5a2c898a6","113f9804bef90dae","1b710b35131c471b","28db77f523047d84","32caab7b40c72493","3c9ebe0a15c9bebc","431d67c49c100d4c","4cc5d4becb3e42b6","597f299cfc657e2a","5fcb6fab3ad6faec","6c44198c4a475817"];

    function sha512Bytes(message) {
        var msg = (typeof message === 'string' ? utf8ToBytes(message) : message).slice();
        var mlen = msg.length * 8; msg.push(0x80);
        while ((msg.length + 16) % 128 !== 0) msg.push(0);
        var high = Math.floor(mlen / Math.pow(2,32)), low = mlen % Math.pow(2,32);
        for (var i = 24; i >= 0; i -= 8) { msg.push((high >>> i) & 0xff); }
        for (var i = 24; i >= 0; i -= 8) { msg.push((low >>> i) & 0xff); }

        var H = [fromHex64("6a09e667f3bcc908"),fromHex64("bb67ae8584caa73b"),fromHex64("3c6ef372fe94f82b"),fromHex64("a54ff53a5f1d36f1"),fromHex64("510e527fade682d1"),fromHex64("9b05688c2b3e6c1f"),fromHex64("1f83d9abfb41bd6b"),fromHex64("5be0cd19137e2179")];

        for (var i = 0; i < msg.length; i += 128) {
            var W = new Array(80);
            for (var t = 0; t < 16; t++) { var off = i + t * 8; W[t] = [msg[off]||0,msg[off+1]||0,msg[off+2]||0,msg[off+3]||0,msg[off+4]||0,msg[off+5]||0,msg[off+6]||0,msg[off+7]||0]; }
            for (var t = 16; t < 80; t++) { W[t] = add64(add64(xor64(xor64(rotr64(W[t-15],1),rotr64(W[t-15],8)),shr64(W[t-15],7)),W[t-7]),add64(xor64(xor64(rotr64(W[t-2],19),rotr64(W[t-2],61)),shr64(W[t-2],6)),W[t-16])); }
            var a=H[0].slice(),b=H[1].slice(),c=H[2].slice(),d=H[3].slice(),e=H[4].slice(),f=H[5].slice(),g=H[6].slice(),h=H[7].slice();
            for (var t = 0; t < 80; t++) {
                var T1 = add64(add64(h,add64(xor64(xor64(rotr64(e,14),rotr64(e,18)),rotr64(e,41)),add64(add64(xor64(xor64(e&f,~e&g),[]),fromHex64(K[t])),W[t]))));
                var T2 = add64(xor64(xor64(rotr64(a,28),rotr64(a,34)),rotr64(a,39)),xor64(xor64(a&b,a&c),b&c));
                h=g;g=f;f=e;e=add64(d,T1);d=c;c=b;b=a;a=add64(T1,T2);
            }
            for (var j=0;j<8;j++) H[j]=add64(H[j],[a[j],b[j],c[j],d[j],e[j],f[j],g[j],h[j]][j]!==undefined?([a,b,c,d,e,f,g,h][j]):H[j]);
            H[0]=add64(H[0],a);H[1]=add64(H[1],b);H[2]=add64(H[2],c);H[3]=add64(H[3],d);H[4]=add64(H[4],e);H[5]=add64(H[5],f);H[6]=add64(H[6],g);H[7]=add64(H[7],h);
        }
        var result = [];
        for (var i = 0; i < 8; i++) for (var j = 0; j < 8; j++) result.push(H[i][j]);
        return result;
    }

    function sha512Hex(message) { var b=sha512Bytes(message); var s=''; for(var i=0;i<b.length;i++)s+=('0'+b[i].toString(16)).slice(-2); return s; }

    root.__sha512Bytes = sha512Bytes;
    root.__sha512Hex = sha512Hex;
})(globalThis);
