// 从 TriAgent 的 kugou_tables.py 程序化提取常量，生成 js/kgg-decoder.js（避免手抄出错）
const fs = require('fs');
const path = require('path');

const py = fs.readFileSync(
  'C:/1/tools/triagent/TriAgent-beta/src/Infrastructure/adapters/platforms/kugou/decoder/kugou_tables.py',
  'utf8'
);
function extractBytes(name) {
  const m = py.match(new RegExp(name + ' = bytes\\(\\[([\\s\\S]*?)\\]'));
  if (!m) throw new Error('未找到 ' + name);
  return m[1].match(/0x([0-9A-Fa-f]{2})/g).map((s) => parseInt(s.slice(2), 16));
}
const mend = extractBytes('PUB_KEY_MEND');
const kgm = extractBytes('KGM_MAGIC');
const vpr = extractBytes('VPR_MAGIC');
console.log('PUB_KEY_MEND length:', mend.length);
console.log('KGM_MAGIC:', kgm.length, ' VPR_MAGIC:', vpr.length);

const hex = (a) => a.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(',');

const js = `/* ============================================================
 * KGG / KGM / VPR（酷狗）解密常量与 KGG v3 解码器
 * 常量与算法由 TriAgent（GPL-3.0，Acooldog/TriAgent，TriMusicDecrypt 衍生）
 * 的 kugou_tables.py / kugou_stream.py 程序化提取与移植 —— 本文件为生成物，勿手改。
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App || (window.App = {});
  const KGG = (App.KGG = App.KGG || {});

  KGG.KGM_MAGIC = new Uint8Array([${hex(kgm)}]);
  KGG.VPR_MAGIC = new Uint8Array([${hex(vpr)}]);
  KGG.PUB_KEY_MEND = new Uint8Array([${hex(mend)}]);
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
    const res = await fetch('/vendor/um/kugou-pubkey.deflate');
    if (!res.ok) throw new Error('KGG 公钥文件加载失败: ' + res.status);
    const ds = new DecompressionStream('deflate-raw');
    const buf = new Uint8Array(await new Response(res.body.pipeThrough(ds)).arrayBuffer());
    KGG._pubKey = buf;
    return buf;
  };
})();
`;

const out = path.join(__dirname, '..', 'js', 'kgg-decoder.js');
fs.writeFileSync(out, js);
console.log('written:', out, js.length, 'chars');
