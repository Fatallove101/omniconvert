// 内联复现第 1 页加密→解密，打印中间值定位不对称点
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const sandbox = { window: { App: {} }, console, TextDecoder, TextEncoder, setTimeout, clearTimeout, atob, btoa, WebAssembly };
sandbox.globalThis = sandbox;
for (const f of ['js/md5.js', 'js/aes.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}
const App = sandbox.window.App;
const hex = (a) => Array.from(a).map((x) => x.toString(16).padStart(2, '0')).join(' ');

function deriveIvSeed(seed) {
  const l = Math.imul(seed, 0x9ef4) >>> 0;
  const r = (Math.floor(seed / 0xce26) * 0x7fffff07) % 0x100000000;
  const v = (l - r) >>> 0;
  if ((v & 0x80000000) === 0) return v >>> 0;
  return (v + 0x7fffff07) >>> 0;
}
function pageIv(p) {
  const iv = new Uint8Array(16);
  const dv = new DataView(iv.buffer);
  let x = p + 1;
  for (let o = 0; o < 16; o += 4) {
    x = deriveIvSeed(x);
    dv.setUint32(o, x >>> 0, true);
  }
  return App.md5(iv);
}
function pageKey(p) {
  const mk = Uint8Array.from([0x1d, 0x61, 0x31, 0x45, 0xb2, 0x47, 0xbf, 0x7f, 0x3d, 0x18, 0x96, 0x72, 0x14, 0x4f, 0xe4, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x73, 0x41, 0x6c, 0x54]);
  new DataView(mk.buffer).setUint32(0x10, p >>> 0, true);
  return App.md5(mk);
}

(async () => {
  const key = pageKey(1);
  const iv = pageIv(1);
  console.log('key:', hex(key));
  console.log('iv :', hex(iv));

  // 伪造一个“明文页 1”
  const p1 = new Uint8Array(1024);
  p1.set(new TextEncoder().encode('SQLite format 3\0'), 0);
  p1[0x10] = 0x04; p1[0x11] = 0x00; p1[0x12] = 0x01; p1[0x13] = 0x01;
  p1[0x14] = 0x00; p1[0x15] = 0x40; p1[0x16] = 0x20; p1[0x17] = 0x20;
  for (let i = 0x18; i < 1024; i++) p1[i] = (i * 13 + 5) & 0xff;
  const eh = p1.slice(0x10, 0x18);
  console.log('eh (P[0x10:0x18]):', hex(eh));

  // 加密：raw = 标准 CBC(P[0x10:1008], key, iv)
  const kc = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  const blocks = 1008 / 16;
  const raw = new Uint8Array(1008);
  let prev = iv.slice();
  for (let b = 0; b < blocks; b++) {
    const xored = new Uint8Array(16);
    for (let i = 0; i < 16; i++) xored[i] = p1[0x10 + b * 16 + i] ^ prev[i];
    const full = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: prev }, kc, xored));
    raw.set(full.slice(0, 16), b * 16);
    prev = full.slice(0, 16);
  }
  console.log('raw[0:16] :', hex(raw.slice(0, 16)));

  // 布局：[0:8]=x, [8:0x10]=raw[0:8], [0x10:0x18]=eh, [0x18:]=raw[8:1008]
  const file = new Uint8Array(1024);
  file.set(raw.subarray(0, 8), 8);
  file.set(eh, 0x10);
  file.set(raw.subarray(8), 0x18);

  // 解密（复刻 decryptKggDb 第 1 页逻辑）
  const expectedHeader = file.slice(0x10, 0x18);
  const swap = file.slice(0x08, 0x10);
  const ff = file.slice();
  ff.set(swap, 0x10);
  const decFirst = App.aesCbcDecryptNoPad(ff.subarray(0x10), key, iv);
  console.log('dec[0:8]  :', hex(decFirst.slice(0, 8)));
  console.log('expected  :', hex(expectedHeader));
  console.log('MATCH:', decFirst.slice(0, 8).every((b, i) => b === expectedHeader[i]));
  // 全量比对
  const final = new Uint8Array(1024);
  final.set(new TextEncoder().encode('SQLite format 3\0'), 0);
  final.set(decFirst, 0x10);
  let diffAt = -1;
  for (let i = 0x10; i < 1024; i++) if (final[i] !== p1[i]) { diffAt = i; break; }
  console.log('first diff at:', diffAt);
})();
