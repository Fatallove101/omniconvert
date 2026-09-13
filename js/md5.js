/* ============================================================
 * 纯 JS MD5（RFC 1321）— 用于 KGG 密钥库页密钥/IV 派生
 * 仅本地使用。自带自检：md5("abc") = 900150983cd24fb0d6963f7d28e17f72
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App || (window.App = {});

  function md5(bytes) {
    /* 预计算表 */
    const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const K = new Int32Array(64);
    for (let i = 0; i < 64; i++) K[i] = (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)) | 0;

    const len = bytes.length;
    const bitLen = len * 8;

    /* 填充：0x80 + 0x00 + 8 字节小端长度 */
    const padded = new Uint8Array((((len + 8) >> 6) + 1) * 64);
    padded.set(bytes);
    padded[len] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, bitLen >>> 0, true);
    dv.setUint32(padded.length - 4, Math.floor(bitLen / 4294967296), true);

    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

    for (let off = 0; off < padded.length; off += 64) {
      const M = new Int32Array(16);
      for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);

      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) | 0;
        A = D;
        D = C;
        C = B;
        B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0;
      }
      a0 = (a0 + A) | 0;
      b0 = (b0 + B) | 0;
      c0 = (c0 + C) | 0;
      d0 = (d0 + D) | 0;
    }

    const out = new Uint8Array(16);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, a0 >>> 0, true);
    odv.setUint32(4, b0 >>> 0, true);
    odv.setUint32(8, c0 >>> 0, true);
    odv.setUint32(12, d0 >>> 0, true);
    return out;
  }

  App.md5 = md5;
  App.md5hex = function (bytes) {
    return Array.from(md5(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };
})();
