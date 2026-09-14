// 自检：QQ 音乐 mgg/mflac（QMC2）与酷狗 KGG v5 的 eKey 流程
// 背景（真实案例）：新版 QQ 音乐 mgg 的页脚是 musicex 结构，QMCFooter.parse 能解析出
//   mediaName 与 size，但 ekey === undefined。旧代码在这种情况下会静默回落到 decryptQMC1
//   静态映射 → 解出垃圾字节 → 又因 TRUST_FALLBACK 里含 mgg 而按 .ogg 输出 → 用户拿到
//   "解密成功但无法播放"的文件。本自检锁定修复后的行为：
//   ① 页脚无明文 eKey 时绝不调用 decryptQMC1、绝不产出文件；
//   ② 提供正确 eKey 时按 QMC2 解密 [0, len-footerSize) 区间并输出正确扩展名；
//   ③ eKey 错误时明确报错；
//   ④ 老变体（页脚带明文 eKey）与 QMC1 老格式的行为保持不变。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

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

/* ---------- 桩引擎：XOR 流密码，密钥对才能还原 ---------- */
const KEY = 'REALKEY';
const MEDIA_NAME = 'O8M0000htC2s4M9K4b.mgg';

function ks(key, i) {
  const kb = Buffer.from(key, 'utf8');
  return kb[i % kb.length] ^ (i & 0xff);
}
function xor(bytes, key) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ ks(key, i);
  return out;
}

let qmc1Calls = 0;
let qmc2Keys = [];

const fakeUm = {
  QMCFooter: {
    parse(tail) {
      const t = Buffer.from(tail);
      const last8 = t.subarray(t.length - 8).toString('latin1');
      if (last8 === 'musicex\0') {
        /* 真实文件结构：尾部 musicex + UTF-16 媒体名，size=192，无明文 ekey */
        const u16 = t.toString('utf16le');
        const m = u16.match(/O8M[^\u0000]*\.mgg/);
        return { ekey: undefined, mediaName: m ? m[0] : '', size: 192 };
      }
      if (last8 === 'QTag\0\0\0\0') return { ekey: KEY, mediaName: 'old-variant.mflac', size: 128 };
      return undefined;
    },
  },
  QMC2: class {
    constructor(ekey) {
      /* 真实引擎：eKey 必须是 base64 且能通过它自己的解封装，否则构造时就抛错 */
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(ekey)) throw new Error('EKey: Failed to decode b64 content');
      this.ekey = ekey;
      qmc2Keys.push(ekey);
    }
    decrypt(buf, off) {
      const dec = xor(buf, this.ekey);
      buf.set(dec);
    }
  },
  decryptQMC1(buf, off) {
    qmc1Calls++;
    const dec = xor(buf, KEY); /* 老静态映射：密钥固定，正常应能还原 */
    buf.set(dec);
  },
  detectAudioType(head) {
    const h = Buffer.from(head.subarray(0, 4)).toString('latin1');
    if (h === 'OggS') return { audioType: 'ogg', needMore: 0 };
    if (h === 'fLaC') return { audioType: 'flac', needMore: 0 };
    return { audioType: 'bin', needMore: 0 };
  },
};

/* ---------- 沙箱：加载真实 kgg-decoder.js（供 App.KGG.parseHeader）与真实 music-tools.js ---------- */
const sandbox = {
  window: {},
  console,
  Uint8Array,
  DataView,
  ArrayBuffer,
  TextDecoder,
  TextEncoder,
  Blob,
  Promise,
  setTimeout,
  clearTimeout,
  Buffer,
};
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'kgg-decoder.js'), 'utf8'), sandbox, { filename: 'kgg-decoder.js' });

const App = sandbox.window.App;
const ASK_CALLS = [];
let askAnswer = null;
App.tools = [];
App.registerTool = (def) => App.tools.push(def);
App.readAsArrayBuffer = async (f) => f.bytes;
App.nextFrame = () => Promise.resolve();
App.um = async () => fakeUm;
App.askMusicEkey = async (kind, hash) => {
  ASK_CALLS.push({ kind, hash });
  return askAnswer;
};

vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'tools', 'music-tools.js'), 'utf8'), sandbox, { filename: 'music-tools.js' });

const musicTool = App.tools.find((t) => t.id === 'music-decrypt');
const kggTool = App.tools.find((t) => t.id === 'kgg-convert');
check('工具已注册（歌曲 / KGG）', !!musicTool && !!kggTool, App.tools.map((t) => t.id).join(','));
check('App.askMusicEkey 已被调用接口替换为通用密钥弹窗', typeof App.askMusicEkey === 'function');

/* ---------- 合成样本 ---------- */
const OGG_PLAIN = (() => {
  const b = new Uint8Array(4096);
  Buffer.from('OggS', 'latin1').copy(Buffer.from(b.buffer));
  for (let i = 4; i < b.length; i++) b[i] = (i * 7) & 0xff;
  return b;
})();
const FLAC_PLAIN = (() => {
  const b = new Uint8Array(4096);
  Buffer.from('fLaC', 'latin1').copy(Buffer.from(b.buffer));
  for (let i = 4; i < b.length; i++) b[i] = (i * 11) & 0xff;
  return b;
})();

function musicexMgg(plain, mediaName) {
  const enc = xor(plain, KEY);
  const footer = new Uint8Array(192);
  footer.fill(0xa5);
  const nameU16 = Buffer.from(mediaName, 'utf16le');
  footer.set(nameU16.subarray(0, Math.min(nameU16.length, 160)), 8);
  footer.set(Buffer.from('musicex\0', 'latin1'), 184);
  const out = new Uint8Array(enc.length + footer.length);
  out.set(enc, 0);
  out.set(footer, enc.length);
  return out;
}
function oldVariantMflac(plain) {
  const enc = xor(plain, KEY);
  const footer = new Uint8Array(128);
  footer.fill(0x5a);
  footer.set(Buffer.from('QTag\0\0\0\0', 'latin1'), 120);
  const out = new Uint8Array(enc.length + footer.length);
  out.set(enc, 0);
  out.set(footer, enc.length);
  return out;
}
function legacyQmc1(plain) {
  return xor(plain, KEY); /* QMC1 静态映射：无页脚 */
}
function kggV5(plain, hash) {
  const header = new Uint8Array(0x400);
  header.set(App.KGG.KGM_MAGIC, 0);
  const dv = new DataView(header.buffer);
  dv.setUint32(0x10, 0x400, true); /* audioOffset */
  dv.setUint32(0x14, 5, true); /* version */
  dv.setUint32(0x18, 0, true); /* slot */
  const hb = Buffer.from(hash, 'utf8');
  dv.setUint32(0x44, hb.length, true);
  header.set(hb, 0x48);
  const enc = xor(plain, KEY);
  const out = new Uint8Array(0x400 + enc.length);
  out.set(header.subarray(0, 0x400), 0);
  out.set(enc, 0x400);
  return out;
}

const ctx = { setStatus() {}, setProgress() {} };
async function runTool(tool, bytes, name) {
  const file = { name, size: bytes.length, bytes };
  try {
    const results = await tool.run([file], {}, ctx);
    const out = [];
    for (const r of results) out.push({ name: r.name, bytes: new Uint8Array(await r.blob.arrayBuffer()) });
    return { ok: true, results: out };
  } catch (e) {
    return { ok: false, message: e && e.message ? e.message : String(e) };
  }
}
const head4 = (u8) => Buffer.from(u8.subarray(0, 4)).toString('latin1');

/* ---------- ① musicex 变体：用户取消（无 eKey） ---------- */
askAnswer = null;
qmc1Calls = 0;
ASK_CALLS.length = 0;
let r = await runTool(musicTool, musicexMgg(OGG_PLAIN, MEDIA_NAME), '方大同 - Love Song_H.mgg');
check('① musicex 无 eKey：不产出任何文件（旧代码会产出打不开的 .ogg）', !r.ok && r.results === undefined, r.message);
check('① 错误提示说明是 musicex 新版变体、无法离线解密', /musicex/.test(r.message || ''), r.message);
check('① 绝不回落到 decryptQMC1（旧代码的核心缺陷）', qmc1Calls === 0, 'qmc1Calls=' + qmc1Calls);
check('① 弹窗按 QQ 类型（kind=qmc）并带上 mediaName', ASK_CALLS.length === 1 && ASK_CALLS[0].kind === 'qmc' && ASK_CALLS[0].hash === MEDIA_NAME, JSON.stringify(ASK_CALLS));

/* ---------- ② musicex 变体：提供正确 eKey ---------- */
askAnswer = KEY;
qmc1Calls = 0;
r = await runTool(musicTool, musicexMgg(OGG_PLAIN, MEDIA_NAME), '方大同 - Love Song_H.mgg');
check('② 提供正确 eKey：转换成功且输出 .ogg', r.ok && r.results.length === 1 && /\.ogg$/.test(r.results[0].name), r.ok ? r.results[0].name : r.message);
check('② 输出内容 = 原 Ogg（页脚 192 字节已正确裁掉）', r.ok && head4(r.results[0].bytes) === 'OggS' && r.results[0].bytes.length === OGG_PLAIN.length, r.ok ? head4(r.results[0].bytes) + ' len=' + r.results[0].bytes.length : r.message);
check('② 未走 QMC1 回落', qmc1Calls === 0, 'qmc1Calls=' + qmc1Calls);

/* ---------- ③ musicex 变体：eKey 错误（构造通过但解出垃圾） ---------- */
askAnswer = 'V1JPTkdLRVkxMjM0NTY3OA==';
r = await runTool(musicTool, musicexMgg(OGG_PLAIN, MEDIA_NAME), '方大同 - Love Song_H.mgg');
check('③ eKey 不对：明确报错且不产出文件', !r.ok && /eKey 不正确/.test(r.message || ''), r.message);

/* ---------- ③b 非法 base64 / 漏字符的 eKey：翻译引擎英文报错 ---------- */
askAnswer = 'NOT-BASE64!!';
r = await runTool(musicTool, musicexMgg(OGG_PLAIN, MEDIA_NAME), '方大同 - Love Song_H.mgg');
check('③b eKey 非法：给出「整段原样复制」的可操作提示', !r.ok && /eKey 无法使用/.test(r.message || '') && /原样复制/.test(r.message || ''), r.message);

/* ---------- ④ 老变体（页脚含明文 eKey）：不弹窗、直接成功 ---------- */
askAnswer = null;
ASK_CALLS.length = 0;
r = await runTool(musicTool, oldVariantMflac(FLAC_PLAIN), 'old.mflac');
check('④ 老变体 mflac：无需弹窗即成功（页脚明文 eKey）', r.ok && r.results.length === 1 && /\.flac$/.test(r.results[0].name) && ASK_CALLS.length === 0, r.ok ? r.results[0].name + ' asks=' + ASK_CALLS.length : r.message);

/* ---------- ⑤ QMC1 老格式：仍走静态映射 ---------- */
askAnswer = null;
qmc1Calls = 0;
r = await runTool(musicTool, legacyQmc1(FLAC_PLAIN), 'legacy.qmcflac');
check('⑤ QMC1 老格式仍走 decryptQMC1 且成功', qmc1Calls === 1 && r.ok && /\.flac$/.test(r.results[0].name), 'qmc1Calls=' + qmc1Calls + ' ' + (r.ok ? r.results[0].name : r.message));

/* ---------- ⑥ KGG v5：区间应从 audioOffset 起（重构后回归保护） ---------- */
askAnswer = KEY;
ASK_CALLS.length = 0;
r = await runTool(kggTool, kggV5(OGG_PLAIN, 'testhash123'), 'song.kgg');
check('⑥ KGG v5：弹窗 kind=kgg 且带 audio_hash', ASK_CALLS.length === 1 && ASK_CALLS[0].kind === 'kgg' && ASK_CALLS[0].hash === 'testhash123', JSON.stringify(ASK_CALLS));
check('⑥ KGG v5：按 [0x400, end) 解密并输出 .ogg', r.ok && /\.ogg$/.test(r.results[0].name) && head4(r.results[0].bytes) === 'OggS', r.ok ? r.results[0].name + ' ' + head4(r.results[0].bytes) : r.message);

console.log('');
if (fail) {
  console.log('===== 失败明细 =====');
  for (const f of failures) console.log('- ' + f);
}
console.log(`RESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
