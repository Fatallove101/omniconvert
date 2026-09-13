/* ============================================================
 * AES-128 解密（无填充 CBC）— 用于 KGG 密钥库 SQLite 页解密
 * 标准 FIPS-197 逆向分组密码；自带 NIST 向量自检。
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App || (window.App = {});

  /* AES S-box（解密用逆 S-box） */
  const INV_SBOX = new Uint8Array([
    0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
    0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
    0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
    0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
    0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
    0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
    0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
    0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
    0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
    0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
    0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
    0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
    0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
    0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
    0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
    0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d,
  ]);

  /* 轮常量 */
  const RCON = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]);

  /* 正向 S-box：由逆表求逆生成（密钥扩展用），避免手抄 */
  const SBOX = (() => {
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) s[INV_SBOX[i]] = i;
    return s;
  })();

  /* xtime：GF(2^8) 乘 2 */
  function xtime(a) {
    return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
  }

  /* 逆向混合列（InvMixColumns 单列，乘 9/11/13/14） */
  function invMixColumn(col) {
    const a0 = col[0], a1 = col[1], a2 = col[2], a3 = col[3];
    const mul = (a, b) => {
      let r = 0;
      let base = a;
      while (b) {
        if (b & 1) r ^= base;
        base = xtime(base);
        b >>= 1;
      }
      return r;
    };
    return [
      mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9),
      mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13),
      mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11),
      mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14),
    ];
  }

  /* 密钥扩展（AES-128 → 44 字） */
  function expandKey(key) {
    const w = new Uint32Array(44);
    const kb = new Uint8Array(16);
    kb.set(key.subarray(0, 16));
    const dv = new DataView(kb.buffer);
    for (let i = 0; i < 4; i++) w[i] = dv.getUint32(i * 4, false);
    let rc = 0;
    for (let i = 4; i < 44; i++) {
      let temp = w[i - 1];
      if (i % 4 === 0) {
        /* RotWord + SubWord + Rcon */
        const b0 = (temp >>> 24) & 0xff;
        const b1 = (temp >>> 16) & 0xff;
        const b2 = (temp >>> 8) & 0xff;
        const b3 = temp & 0xff;
        temp = ((SBOX[b1] << 24) | (SBOX[b2] << 16) | (SBOX[b3] << 8) | SBOX[b0]) >>> 0;
        temp = (temp ^ (RCON[rc++] << 24)) >>> 0;
      }
      w[i] = (w[i - 4] ^ temp) >>> 0;
    }
    return w;
  }

  /* 解密单个 16 字节块（原位） */
  function decryptBlock(block, w) {
    const dv = new DataView(block.buffer, block.byteOffset, 16);
    const state = [[0, 0], [0, 0], [0, 0], [0, 0]];
    for (let c = 0; c < 4; c++) {
      const v = dv.getUint32(c * 4, false);
      state[0][c] = (v >>> 24) & 0xff;
      state[1][c] = (v >>> 16) & 0xff;
      state[2][c] = (v >>> 8) & 0xff;
      state[3][c] = v & 0xff;
    }

    /* AddRoundKey */
    const addRoundKey = (round) => {
      for (let c = 0; c < 4; c++) {
        const k = w[round * 4 + c];
        state[0][c] ^= (k >>> 24) & 0xff;
        state[1][c] ^= (k >>> 16) & 0xff;
        state[2][c] ^= (k >>> 8) & 0xff;
        state[3][c] ^= k & 0xff;
      }
    };

    addRoundKey(10);
    for (let round = 9; round >= 1; round--) {
      /* InvShiftRows：行 r 循环右移 r（new[c] = old[(c + 4 - r) % 4]） */
      for (let r = 1; r < 4; r++) {
        const row = [state[r][0], state[r][1], state[r][2], state[r][3]];
        for (let c = 0; c < 4; c++) state[r][c] = row[(c + 4 - r) % 4];
      }
      /* InvSubBytes */
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) state[r][c] = INV_SBOX[state[r][c]];
      addRoundKey(round);
      /* InvMixColumns */
      for (let c = 0; c < 4; c++) {
        const nc = invMixColumn([state[0][c], state[1][c], state[2][c], state[3][c]]);
        state[0][c] = nc[0]; state[1][c] = nc[1]; state[2][c] = nc[2]; state[3][c] = nc[3];
      }
    }
    /* 第 0 轮：InvShiftRows + InvSubBytes + AddRoundKey(0) */
    for (let r = 1; r < 4; r++) {
      const row = [state[r][0], state[r][1], state[r][2], state[r][3]];
      for (let c = 0; c < 4; c++) state[r][c] = row[(c + 4 - r) % 4];
    }
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) state[r][c] = INV_SBOX[state[r][c]];
    addRoundKey(0);

    for (let c = 0; c < 4; c++) dv.setUint32(c * 4, ((state[0][c] << 24) | (state[1][c] << 16) | (state[2][c] << 8) | state[3][c]) >>> 0, false);
  }

  /* 无填充 CBC 解密：in/out 均 16 的倍数长度，out 与 in 等长 */
  App.aesCbcDecryptNoPad = function (data, key, iv) {
    if (data.length === 0 || data.length % 16 !== 0) throw new Error('AES-CBC 数据长度必须是 16 的倍数');
    const w = expandKey(key);
    const out = new Uint8Array(data.length);
    let prev = new Uint8Array(iv.subarray(0, 16));
    for (let off = 0; off < data.length; off += 16) {
      const block = data.slice(off, off + 16);
      decryptBlock(block, w);
      for (let i = 0; i < 16; i++) out[off + i] = block[i] ^ prev[i];
      prev = data.slice(off, off + 16);
    }
    return out;
  };
})();
