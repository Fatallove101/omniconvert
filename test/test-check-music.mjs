// 自检：test/check-music.mjs 的判定逻辑
//  一、真引擎 + 真实/合成样本：不支持扩展名、酷狗 v3/v5、酷我、以及真实 mgg 样本（存在时才测）
//  二、桩引擎验分支：ncm 正常/异常、QMC1、QMC2（含明文 eKey / musicex 无 eKey）、mmp4
//  三、元数据一致性：格式分组与 KEY_HINTS 覆盖完整
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyFile, loadEngine, loadKgg, ALL_EXTS, KEY_NEEDED_EXTS, OFFLINE_ONLY_EXTS, PLATFORMS, KEY_HINTS, platformOf } from './check-music.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const REAL_MGG = 'C:\\Users\\26951\\Desktop\\1\\方大同 - Love Song_H.mgg';

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) {
    pass++;
    console.log('PASS', name);
  } else {
    fail++;
    const line = name + (extra ? '  → ' + extra : '');
    failures.push(line);
    console.log('FAIL', line);
  }
}

/* ---------- 一、真引擎 ---------- */
const { um } = loadEngine();
const KGG = loadKgg();
const engine = { um, KGG };

check('引擎与解码器加载成功', typeof um.QMCFooter.parse === 'function' && typeof KGG.parseHeader === 'function');

function kugouHeader(version, hash) {
  const h = new Uint8Array(0x400);
  h.set(KGG.KGM_MAGIC, 0);
  const dv = new DataView(h.buffer);
  dv.setUint32(0x10, 0x400, true);
  dv.setUint32(0x14, version, true);
  if (hash) {
    const hb = Buffer.from(hash, 'utf8');
    dv.setUint32(0x44, hb.length, true);
    h.set(hb, 0x48);
  }
  const out = new Uint8Array(0x400 + 512);
  out.set(h, 0);
  return out;
}

const rUnsupported = classifyFile('note.txt', new Uint8Array(64), engine);
check('不支持扩展名 → ⛔', rUnsupported.verdict === '⛔ 不支持' && rUnsupported.ok === false, rUnsupported.verdict);

const rV3 = classifyFile('song.kgg', kugouHeader(3), engine);
check('酷狗 v3 → ✅ 可离线（内置解码器）', rV3.verdict === '✅ 可离线解密' && /v3/.test(rV3.detail), rV3.verdict + ' / ' + rV3.detail);

const rV5 = classifyFile('song.kgg', kugouHeader(5, 'abcdef123456'), engine);
check('酷狗 v5 → 🔑 需要密钥（带 audio_hash 与取密钥提示）', rV5.verdict === '🔑 需要密钥' && rV5.detail.includes('abcdef123456') && !!rV5.keyHint && rV5.keyHint.includes('KGMusicV3.db'), rV5.detail);

const rV1 = classifyFile('old.kgm', kugouHeader(1), engine);
check('酷狗 v1 → ✅ 可离线（密钥在头部）', rV1.verdict === '✅ 可离线解密', rV1.verdict);

const kwmBytes = new Uint8Array(0x400 + 4096);
kwmBytes.fill(0x37);
const rKwm = classifyFile('song.kwms', kwmBytes, engine);
check('酷我 kwms（v1 试解不通过）→ 🔑 需要密钥 + 酷我取密钥提示', rKwm.verdict === '🔑 需要密钥' && /酷我/.test(rKwm.keyHint || ''), rKwm.verdict + ' / ' + rKwm.detail);

if (fs.existsSync(REAL_MGG)) {
  const bytes = new Uint8Array(fs.readFileSync(REAL_MGG));
  const r = classifyFile(path.basename(REAL_MGG), bytes, engine, { trial: true });
  check('真实 mgg 样本 → 🔑 需要密钥（musicex 页脚、无 eKey）', r.verdict === '🔑 需要密钥' && /musicex/.test(r.detail), r.verdict + ' / ' + r.detail);
  console.log('     实际输出：', r.detail);
  console.log('     取密钥提示：', r.keyHint);
} else {
  console.log('SKIP 真实 mgg 样本不存在（' + REAL_MGG + '）');
}

/* ---------- 二、桩引擎验分支 ---------- */
const OGG = (() => {
  const b = new Uint8Array(4096);
  Buffer.from('OggS', 'latin1').copy(Buffer.from(b.buffer));
  return b;
})();
const FLAC = (() => {
  const b = new Uint8Array(4096);
  Buffer.from('fLaC', 'latin1').copy(Buffer.from(b.buffer));
  return b;
})();
const KEY = 'REALKEY';
function xor(bytes, key) {
  const kb = Buffer.from(key);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ kb[i % kb.length] ^ (i & 0xff);
  return out;
}
const stub = {
  um: {
    detectAudioType(head) {
      const h = Buffer.from(head.subarray(0, 4)).toString('latin1');
      return { audioType: h === 'OggS' ? 'ogg' : h === 'fLaC' ? 'flac' : 'bin', needMore: 0 };
    },
    decryptQMC1(buf) {
      buf.set(xor(buf, KEY));
    },
    QMCFooter: { parse: (tail) => (globalThis.__stubFooter === undefined ? undefined : globalThis.__stubFooter) },
    QMC2: class {
      constructor(k) {
        this.k = k;
      }
      decrypt(buf) {
        buf.set(xor(buf, this.k));
      }
    },
    NCMFile: class {
      open() {
        return globalThis.__ncmOk ? 0 : -1;
      }
      get audioOffset() {
        return 16;
      }
      decrypt(buf) {
        buf.set(xor(buf, KEY));
      }
    },
    KWMDecipherV1: class {
      decrypt(buf) {
        buf.set(xor(buf, 'WRONGKEY'));
      }
    },
  },
  KGG,
};

globalThis.__ncmOk = true;
const stubNcmBody = new Uint8Array(4096);
stubNcmBody.set(xor(OGG, KEY), 0);
const ncmBytes = new Uint8Array(16 + stubNcmBody.length);
ncmBytes.set(stubNcmBody, 16);
let r = classifyFile('a.ncm', ncmBytes, stub, { trial: true });
check('桩：ncm 正常 → ✅ 可离线（试解输出 ogg）', r.verdict === '✅ 可离线解密' && /输出 ogg/.test(r.detail), r.verdict + ' / ' + r.detail);

globalThis.__ncmOk = false;
r = classifyFile('bad.ncm', new Uint8Array(4096), stub, { trial: true });
check('桩：ncm 头部异常 → ❓ 无法判断（不会误报可离线）', r.verdict === '❓ 无法判断', r.verdict);

r = classifyFile('a.qmcflac', xor(FLAC, KEY), stub, { trial: true });
check('桩：qmcflac → ✅ 可离线（QMC1 试解输出 flac）', r.verdict === '✅ 可离线解密' && /输出 flac/.test(r.detail), r.verdict + ' / ' + r.detail);

globalThis.__stubFooter = { ekey: KEY, mediaName: 'x.mflac', size: 128 };
const enc = xor(FLAC, KEY);
const withFooter = new Uint8Array(enc.length + 128);
withFooter.set(enc, 0);
r = classifyFile('a.mflac', withFooter, stub, { trial: true });
check('桩：mflac 页脚含明文 eKey → ✅ 可离线', r.verdict === '✅ 可离线解密' && /明文 eKey/.test(r.detail), r.verdict + ' / ' + r.detail);

globalThis.__stubFooter = { ekey: undefined, mediaName: 'y.mmp4', size: 192 };
r = classifyFile('a.mmp4', withFooter, stub, { trial: true });
check('桩：mmp4 musicex 页脚无 eKey → 🔑 需要密钥', r.verdict === '🔑 需要密钥' && /musicex/.test(r.detail), r.verdict + ' / ' + r.detail);

globalThis.__stubFooter = undefined;
r = classifyFile('a.mgg', xor(OGG, KEY), stub, { trial: true });
check('桩：mgg 无页脚 → 🔑 需要密钥（未知变体）', r.verdict === '🔑 需要密钥', r.verdict + ' / ' + r.detail);

/* ---------- 三、元数据一致性 ---------- */
const allFromPlatforms = Object.values(PLATFORMS).flatMap((p) => p.exts).sort();
check('平台格式集合与 ALL_EXTS 完全一致', JSON.stringify(allFromPlatforms) === JSON.stringify([...ALL_EXTS].sort()), allFromPlatforms.join(',') + ' vs ' + [...ALL_EXTS].sort().join(','));
check('图一四类平台都有取密钥/说明文案', ['netease', 'qq', 'kugou', 'kuwo'].every((p) => !!KEY_HINTS[p]), Object.keys(KEY_HINTS).join(','));
check('平台归属正确（mmp4→QQ、kwms→酷我、vpr→酷狗、ncm→网易云）', platformOf('mmp4') === 'qq' && platformOf('kwms') === 'kuwo' && platformOf('vpr') === 'kugou' && platformOf('ncm') === 'netease');
check('需要密钥集合与离线集合无交叉', KEY_NEEDED_EXTS.every((e) => !OFFLINE_ONLY_EXTS.includes(e)), KEY_NEEDED_EXTS.filter((e) => OFFLINE_ONLY_EXTS.includes(e)).join(','));

console.log('');
if (fail) {
  console.log('===== 失败明细 =====');
  for (const f of failures) console.log('- ' + f);
}
console.log(`RESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
