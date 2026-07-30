// ============================================
// MD5 — 纯 JS 实现（备选，优先走 Rust op）
// ============================================
(function(root) {
    function rotl(x,n){return(x<<n)|(x>>>32-n);}
    function utf8ToBytes(str) { return Array.from(new TextEncoder().encode(str)); }

    function md5Bytes(message) {
        var msg = (typeof message === 'string' ? utf8ToBytes(message) : message).slice();
        var mlen = msg.length * 8; msg.push(0x80);
        while ((msg.length + 8) % 64 !== 0) msg.push(0);
        for (var i = 0; i < 8; i++) { msg.push(mlen & 0xff); mlen = Math.floor(mlen / 256); }
        var a=0x67452301,b=0xefcdab89,c=0x98badcfe,d=0x10325476;
        var S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
        var K=[0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
        for (var i = 0; i < msg.length; i += 64) {
            var aa=a,bb=b,cc=c,dd=d;
            for (var j = 0; j < 64; j++) {
                var f,g;
                if(j<16){f=(b&c)|(~b&d);g=j;}else if(j<32){f=(d&b)|(~d&c);g=(5*j+1)%16;}else if(j<48){f=b^c^d;g=(3*j+5)%16;}else{f=c^(b|~d);g=(7*j)%16;}
                var temp=d;d=c;c=b;
                var offset=i+g*4,m=((msg[offset]||0)|((msg[offset+1]||0)<<8)|((msg[offset+2]||0)<<16)|((msg[offset+3]||0)<<24))>>>0;
                b=(b+rotl((a+f+K[j]+m)>>>0,S[j]))>>>0;a=temp;
            }
            a=(a+aa)>>>0;b=(b+bb)>>>0;c=(c+cc)>>>0;d=(d+dd)>>>0;
        }
        var r=[]; for(var i=0;i<4;i++){r.push(a&0xff);r.push((a>>>8)&0xff);r.push((a>>>16)&0xff);r.push((a>>>24)&0xff);var t=a;a=b;b=c;c=d;d=t;}
        return r;
    }

    function md5Hex(message) { var b=md5Bytes(message); var s=''; for(var i=0;i<b.length;i++)s+=('0'+b[i].toString(16)).slice(-2); return s; }

    root.__md5Bytes = md5Bytes;
    root.__md5Hex = md5Hex;
})(globalThis);
