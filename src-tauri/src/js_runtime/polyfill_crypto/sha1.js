// ============================================
// SHA-1 — 纯 JS 实现
// ============================================
(function(root) {
    function rotl(x,n){return(x<<n)|(x>>>32-n);}
    function utf8ToBytes(str) { return Array.from(new TextEncoder().encode(str)); }
    function wordsToBytes(words) { var b=[]; for(var i=0;i<words.length;i++) { b.push((words[i]>>>24)&0xff); b.push((words[i]>>>16)&0xff); b.push((words[i]>>>8)&0xff); b.push(words[i]&0xff); } return b; }

    function sha1Bytes(message) {
        var msg = (typeof message === 'string' ? utf8ToBytes(message) : message).slice();
        var mlen = msg.length * 8; msg.push(0x80);
        while ((msg.length + 8) % 64 !== 0) msg.push(0);
        for (var i = 0; i < 8; i++) { msg.push((mlen >>> (56 - i * 8)) & 0xff); }
        var H = [0x67452301,0xefcdab89,0x98badcfe,0x10325476,0xc3d2e1f0];
        for (var i = 0; i < msg.length; i += 64) {
            var W = new Array(80);
            for (var t=0;t<16;t++)W[t]=(msg[i+t*4]<<24)|(msg[i+t*4+1]<<16)|(msg[i+t*4+2]<<8)|msg[i+t*4+3];
            for(var t=16;t<80;t++)W[t]=rotl(W[t-3]^W[t-8]^W[t-14]^W[t-16],1);
            var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4];
            for(var t=0;t<80;t++){var temp=(rotl(a,5)+((t<20)?((b&c)|(~b&d)):(t<40)?(b^c^d):(t<60)?((b&c)|(b&d)|(c&d)):(b^c^d))+e+W[t]+((t<20)?0x5a827999:(t<40)?0x6ed9eba1:(t<60)?0x8f1bbcdc:0xca62c1d6))>>>0;e=d;d=c;c=rotl(b,30);b=a;a=temp;}
            H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;
        }
        return wordsToBytes(H).slice(0,20);
    }

    function sha1Hex(message) { var b=sha1Bytes(message); var s=''; for(var i=0;i<b.length;i++)s+=('0'+b[i].toString(16)).slice(-2); return s; }

    root.__sha1Bytes = sha1Bytes;
    root.__sha1Hex = sha1Hex;
})(globalThis);
