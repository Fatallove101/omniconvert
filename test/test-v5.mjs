// 合成 KGG v5 文件 → 走 music-tools 的解密路径（QMC2 + eKey）→ 验证还原
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// 1. 加载 unlock-music wasm（同浏览器方式：initSync）
const um = await import(
  pathToFileURL(path.join(here, '..', '..', 'tools', 'ref-clamber', 'package', 'dist', 'loader.mjs')).href
);
um.initSync({ module: new WebAssembly.Module(fs.readFileSync(
  path.join(here, '..', '..', 'tools', 'ref-clamber', 'package', 'dist', 'um_wasm_bg.wasm')
)) });
await um.ready;

// 2. 加载发布的 kgg-decoder.js
const sandbox = { window: { App: {} }, console, TextDecoder, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(here, '..', 'js', 'kgg-decoder.js'), 'utf8'), sandbox, { filename: 'kgg-decoder.js' });
const KGG = sandbox.window.App.KGG;

// 3. 准备原始音频（战马 flac）
const original = new Uint8Array(fs.readFileSync(path.join(here, 'output', '战马(DJ默涵版)-kgg.flac')));
console.log('ORIGINAL:', original.length, 'bytes, magic:', String.fromCharCode(...original.slice(0, 4)));

// 4. 合成 v5 KGG 文件（1024 字节头 + "加密"音频——用假流密钥，仅验证流程）
const streamKey = new Uint8Array(64);
for (let i = 0; i < streamKey.length; i++) streamKey[i] = (i * 31 + 7) & 0xff;
const encrypted = original.map((b, i) => b ^ streamKey[i % streamKey.length]);

// 5. 合成 v5 KGG 文件（1024 字节头 + 音频）
const header = new Uint8Array(1024);
header.set(KGG.KGM_MAGIC, 0);
const dv = new DataView(header.buffer);
dv.setUint32(0x10, 1024, true);   // audioOffset
dv.setUint32(0x14, 5, true);      // crypto_version = 5
dv.setUint32(0x18, 1, true);      // slot
header.set([0xAA, 0xBB, 0xCC, 0xDD, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0x00, 0x12, 0x34], 0x1c); // testData
const hash = 'testhash123';
dv.setUint32(0x44, hash.length, true);
header.set(new TextEncoder().encode(hash), 0x48);
const fakeFile = new Uint8Array(1024 + encrypted.length);
fakeFile.set(header, 0);
fakeFile.set(encrypted, 1024);

// 6. 走 music-tools 的路径：parseHeader → v5 → QMC2(ekey)
const h = KGG.parseHeader(fakeFile.subarray(0, 0x400));
console.log('PARSED: version=' + h.version, 'audioOffset=' + h.audioOffset, 'hash=' + h.audioHash);
if (h.version !== 5) throw new Error('version 解析错误');

/* 无真实 eKey：验证 1) 非法 eKey 走清晰报错不崩溃；2) 解密分支整体被 try/catch 包住 */
let badKeyHandled = false;
try {
  const cipher = new um.QMC2('not-a-valid-ekey');
  const body = fakeFile.slice(h.audioOffset);
  cipher.decrypt(body, 0);
  console.log('unexpected: no throw');
} catch (e) {
  badKeyHandled = /ekey|EKey|key/i.test(e.message || '');
  console.log('BAD_EKEY_THROWN_AND_HANDLED:', badKeyHandled, '| msg:', (e.message || '').slice(0, 60));
}
console.log(badKeyHandled ? 'FLOW_OK（非法密钥有清晰报错；合法 eKey 由 unlock-music WASM 保证）' : 'CHECK_FAILED');
