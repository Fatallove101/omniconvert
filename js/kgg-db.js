/* ============================================================
 * KGMusicV3.db（酷狗 KGG v5 密钥库）解密与密钥提取
 * 算法移植自 TriAgent (GPL-3.0) kugou_kgg_db.py：
 *  - 每页 1KB；页密钥 = MD5(master_key[0:0x10] + u32页号)；页 IV = MD5(派生序列)
 *  - 第 1 页特殊处理（0x10-0x18 与 0x08-0x10 交换后解密，校验后还原 SQLite 头）
 *  - 解密后为标准 SQLite：select EncryptionKeyId, EncryptionKey from ShareFileItems
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App || (window.App = {});

  const MASTER_KEY = Uint8Array.from([
    0x1d, 0x61, 0x31, 0x45, 0xb2, 0x47, 0xbf, 0x7f, 0x3d, 0x18, 0x96, 0x72, 0x14, 0x4f, 0xe4, 0xbf,
    0x00, 0x00, 0x00, 0x00, 0x73, 0x41, 0x6c, 0x54,
  ]);
  const PAGE_SIZE = 0x400;
  const SQLITE_HEADER = new TextEncoder().encode('SQLite format 3\0');

  function deriveIvSeed(seed) {
    const leftSafe = Math.imul(seed, 0x9ef4) >>> 0;
    const right = (Math.floor(seed / 0xce26) * 0x7fffff07) % 0x100000000;
    const value = (leftSafe - right) >>> 0;
    if ((value & 0x80000000) === 0) return value >>> 0;
    return (value + 0x7fffff07) >>> 0;
  }

  function derivePageIv(page) {
    const iv = new Uint8Array(16);
    const dv = new DataView(iv.buffer);
    let p = page + 1;
    for (let off = 0; off < 16; off += 4) {
      p = deriveIvSeed(p);
      dv.setUint32(off, p >>> 0, true);
    }
    return App.md5(iv);
  }

  function derivePageKey(page) {
    const mk = MASTER_KEY.slice();
    new DataView(mk.buffer).setUint32(0x10, page >>> 0, true);
    return App.md5(mk);
  }

  function validateFirstPageHeader(header) {
    const dv = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const o10 = dv.getUint32(0x10, true);
    const o14 = dv.getUint32(0x14, true);
    const v6 = ((o10 & 0xff) << 8) | ((o10 & 0xff00) << 16);
    const ok = o14 === 0x20204000 && v6 - 0x200 <= 0xfe00 && ((v6 - 1) & v6) === 0;
    if (!ok) throw new Error('不是有效的 KGG 密钥库文件（页 1 头校验失败）');
  }

  /** 解密整个密钥库 → 标准 SQLite 字节 */
  App.decryptKggDb = function (buffer) {
    const data = buffer.slice();
    if (data.length >= SQLITE_HEADER.length) {
      let isPlain = true;
      for (let i = 0; i < SQLITE_HEADER.length; i++) if (data[i] !== SQLITE_HEADER[i]) { isPlain = false; break; }
      if (isPlain) return data; /* 未加密的库直接返回 */
    }
    if (!data.length || data.length % PAGE_SIZE !== 0) {
      throw new Error('密钥库文件大小异常（不是 1KB 页的整数倍）');
    }
    const first = data.slice(0, PAGE_SIZE);
    validateFirstPageHeader(first);
    const expectedHeader = first.slice(0x10, 0x18);
    const swap = first.slice(0x08, 0x10);
    first.set(swap, 0x10);
    const decFirst = App.aesCbcDecryptNoPad(first.subarray(0x10), derivePageKey(1), derivePageIv(1));
    first.set(decFirst, 0x10);
    for (let i = 0; i < 8; i++) {
      if (first[0x10 + i] !== expectedHeader[i]) throw new Error('密钥库第 1 页解密失败（文件可能不完整）');
    }
    first.set(SQLITE_HEADER, 0);
    data.set(first, 0);
    for (let page = 2; page <= data.length / PAGE_SIZE; page++) {
      const start = (page - 1) * PAGE_SIZE;
      const dec = App.aesCbcDecryptNoPad(data.subarray(start, start + PAGE_SIZE), derivePageKey(page), derivePageIv(page));
      data.set(dec, start);
    }
    return data;
  };

  /** 从解密后的 SQLite 提取 { EncryptionKeyId: EncryptionKey } 映射（用 sql.js） */
  App.extractKggKeyMapping = function (sqliteBytes) {
    /* window.exports 垫片可能让 sql.js 的 UMD 把 initSqlJs 挂到 exports 上，两处都找 */
    const sqlInit = (window.exports && window.exports.initSqlJs) || window.initSqlJs;
    if (typeof sqlInit !== 'function') {
      throw new Error('SQLite 引擎未加载，请刷新页面重试');
    }
    return Promise.resolve(sqlInit({
      locateFile: () => 'vendor/sqljs/sql-wasm.wasm',
    })).then((SQL) => {
      const db = new SQL.Database(sqliteBytes);
      try {
        const stmt = db.prepare("select EncryptionKeyId, EncryptionKey from ShareFileItems where EncryptionKey != '' and EncryptionKey is not null");
        const map = {};
        while (stmt.step()) {
          const row = stmt.get();
          map[String(row[0])] = String(row[1]);
        }
        stmt.free();
        return map;
      } finally {
        db.close();
      }
    });
  };
})();
