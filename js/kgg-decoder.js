/* ============================================================
 * KGG / KGM / VPR（酷狗）解密常量与 KGG v3 解码器
 * 常量与算法由 TriAgent（GPL-3.0，Acooldog/TriAgent，TriMusicDecrypt 衍生）
 * 的 kugou_tables.py / kugou_stream.py 程序化提取与移植 —— 本文件为生成物，勿手改。
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App || (window.App = {});
  const KGG = (App.KGG = App.KGG || {});

  KGG.KGM_MAGIC = new Uint8Array([0x7c,0xd5,0x32,0xeb,0x86,0x02,0x7f,0x4b,0xa8,0xaf,0xa6,0x8e,0x0f,0xff,0x99,0x14]);
  KGG.VPR_MAGIC = new Uint8Array([0x05,0x28,0xbc,0x96,0xe9,0xe4,0x5a,0x43,0x91,0xaa,0xbd,0xd0,0x7a,0xf5,0x36,0x31]);
  KGG.PUB_KEY_MEND = new Uint8Array([0xb8,0xd5,0x3d,0xb2,0xe9,0xaf,0x78,0x8c,0x83,0x33,0x71,0x51,0x76,0xa0,0xcd,0x37,0x2f,0x3e,0x35,0x8d,0xa9,0xbe,0x98,0xb7,0xe7,0x8c,0x22,0xce,0x5a,0x61,0xdf,0x68,0x69,0x89,0xfe,0xa5,0xb6,0xde,0xa9,0x77,0xfc,0xc8,0xbd,0xbd,0xe5,0x6d,0x3e,0x5a,0x36,0xef,0x69,0x4e,0xbe,0xe1,0xe9,0x66,0x1c,0xf3,0xd9,0x02,0xb6,0xf2,0x12,0x9b,0x44,0xd0,0x6f,0xb9,0x35,0x89,0xb6,0x46,0x6d,0x73,0x82,0x06,0x69,0xc1,0xed,0xd7,0x85,0xc2,0x30,0xdf,0xa2,0x62,0xbe,0x79,0x2d,0x62,0x62,0x3d,0x0d,0x7e,0xbe,0x48,0x89,0x23,0x02,0xa0,0xe4,0xd5,0x75,0x51,0x32,0x02,0x53,0xfd,0x16,0x3a,0x21,0x3b,0x16,0x0f,0xc3,0xb2,0xbb,0xb3,0xe2,0xba,0x3a,0x3d,0x13,0xec,0xf6,0x01,0x45,0x84,0xa5,0x70,0x0f,0x93,0x49,0x0c,0x64,0xcd,0x31,0xd5,0xcc,0x4c,0x07,0x01,0x9e,0x00,0x1a,0x23,0x90,0xbf,0x88,0x1e,0x3b,0xab,0xa6,0x3e,0xc4,0x73,0x47,0x10,0x7e,0x3b,0x5e,0xbc,0xe3,0x00,0x84,0xff,0x09,0xd4,0xe0,0x89,0x0f,0x5b,0x58,0x70,0x4f,0xfb,0x65,0xd8,0x5c,0x53,0x1b,0xd3,0xc8,0xc6,0xbf,0xef,0x98,0xb0,0x50,0x4f,0x0f,0xea,0xe5,0x83,0x58,0x8c,0x28,0x2c,0x84,0x67,0xcd,0xd0,0x9e,0x47,0xdb,0x27,0x50,0xca,0xf4,0x63,0x63,0xe8,0x97,0x7f,0x1b,0x4b,0x0c,0xc2,0xc1,0x21,0x4c,0xcc,0x58,0xf5,0x94,0x52,0xa3,0xf3,0xd3,0xe0,0x68,0xf4,0x00,0x23,0xf3,0x5e,0x0a,0x7b,0x93,0xdd,0xab,0x12,0xb2,0x13,0xe8,0x84,0xd7,0xa7,0x9f,0x0f,0x32,0x4c,0x55,0x1d,0x04,0x36,0x52,0xdc,0x03,0xf3,0xf9,0x4e,0x42,0xe9,0x3d,0x61,0xef,0x7c,0xb6,0xb3,0x93,0x50]);
  KGG.MAG = 16;
  KGG.OWN_LEN = 17;

  /* 解析 KGG/KGM 头（读 1024 字节头的前 0x40 即可；v5 的 hash 在 0x44 起） */
  KGG.parseHeader = function (header) {
    if (!ArrayBuffer.isView(header) || header.length < 0x40) throw new Error('KGG 头部不完整');
    for (let i = 0; i < 16; i++) {
      if (header[i] !== KGG.KGM_MAGIC[i] && header[i] !== KGG.VPR_MAGIC[i]) {
        throw new Error('不是 KGG/KGM/VPR 容器');
      }
    }
    const dv = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const audioOffset = dv.getUint32(0x10, true);
    const version = dv.getUint32(0x14, true);
    const slot = dv.getUint32(0x18, true);
    const testData = header.slice(0x1c, 0x2c);
    let audioHash = '';
    if (version >= 5 && header.length >= 0x48) {
      const hashLen = dv.getUint32(0x44, true);
      if (hashLen > 0 && 0x48 + hashLen <= header.length) {
        audioHash = new TextDecoder().decode(header.subarray(0x48, 0x48 + hashLen));
      }
    }
    return { audioOffset, version, slot, testData, audioHash };
  };

  function buildOwnTables(ownKey) {
    const tables = [];
    for (const kb of ownKey) {
      const t = new Uint8Array(256);
      for (let src = 0; src < 256; src++) {
        let v = src ^ kb;
        v ^= (v & 0x0f) << 4;
        t[src] = v;
      }
      tables.push(t);
    }
    return tables;
  }

  let pubTablesCache = null;
  function buildPubTables() {
    if (pubTablesCache) return pubTablesCache;
    const tables = [];
    for (const mb of KGG.PUB_KEY_MEND) {
      const t = new Uint8Array(256);
      for (let p = 0; p < 256; p++) {
        let v = p ^ mb;
        v ^= (v & 0x0f) << 4;
        t[p] = v;
      }
      tables.push(t);
    }
    pubTablesCache = tables;
    return tables;
  }

  let phaseCache = null;
  let phaseCacheKey = null;
  function getPhaseTables(ownKey) {
    const key = ownKey.join(',');
    if (phaseCache && phaseCacheKey === key) return phaseCache;
    const ownTables = buildOwnTables(ownKey);
    const pubTables = buildPubTables();
    const phases = [];
    for (let phase = 0; phase < 17; phase++) {
      const ps = phase * 16;
      const ownPhase = [];
      const pubPhase = [];
      for (let i = 0; i < 16; i++) {
        ownPhase.push(ownTables[(ps + i) % KGG.OWN_LEN]);
        pubPhase.push(pubTables[ps + i]);
      }
      phases.push([ownPhase, pubPhase]);
    }
    phaseCache = phases;
    phaseCacheKey = key;
    return phases;
  }

  /* KGG v3 流式解码（逐块查表），data 会被原位改写。
   * startPositions 从音频数据起点（含头时传 0）。offset 语义：相对 data 起点。 */
  KGG.decodeV3 = function (data, ownKey, pubKey, startPos) {
    const ownTables = buildOwnTables(ownKey);
    const pubTables = buildPubTables();
    const phaseTables = getPhaseTables(ownKey);
    const ownLen = ownTables.length;
    const pubLen = pubKey.length;
    const mendLen = pubTables.length;
    const total = data.length;
    let offset = 0;
    let pos = startPos;
    while (offset < total && (pos & 0x0f) !== 0) {
      const pubIndex = Math.floor(pos / KGG.MAG);
      if (pubIndex >= pubLen) throw new Error('公钥长度不足（文件过大）');
      const pubValue = pubKey[pubIndex];
      data[offset] = ownTables[pos % ownLen][data[offset]] ^ pubTables[pos % mendLen][pubValue];
      offset++; pos++;
    }
    let blockIndex = Math.floor(pos / KGG.MAG);
    while (offset + KGG.MAG <= total) {
      if (blockIndex >= pubLen) throw new Error('公钥长度不足（文件过大）');
      const phase = blockIndex % 17;
      const ownPhase = phaseTables[phase][0];
      const pubPhase = phaseTables[phase][1];
      const pubValue = pubKey[blockIndex];
      for (let c = 0; c < 16; c++) {
        data[offset + c] = ownPhase[c][data[offset + c]] ^ pubPhase[c][pubValue];
      }
      offset += KGG.MAG; pos += KGG.MAG; blockIndex++;
    }
    while (offset < total) {
      const pubIndex = Math.floor(pos / KGG.MAG);
      if (pubIndex >= pubLen) throw new Error('公钥长度不足（文件过大）');
      const pubValue = pubKey[pubIndex];
      data[offset] = ownTables[pos % ownLen][data[offset]] ^ pubTables[pos % mendLen][pubValue];
      offset++; pos++;
    }
    return data;
  };

  /* 公钥前缀（deflate-raw）按需加载解压，单例缓存。支持单曲 ≤128MB。 */
  KGG.loadPubKey = async function () {
    if (KGG._pubKey) return KGG._pubKey;
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('浏览器过旧，缺少 DecompressionStream，无法解压 KGG 公钥');
    }
    const res = await fetch(new URL('vendor/um/kugou-pubkey.deflate', document.baseURI));
    if (!res.ok) throw new Error('KGG 公钥文件加载失败: ' + res.status);
    const ds = new DecompressionStream('deflate-raw');
    const buf = new Uint8Array(await new Response(res.body.pipeThrough(ds)).arrayBuffer());
    KGG._pubKey = buf;
    return buf;
  };
})();
