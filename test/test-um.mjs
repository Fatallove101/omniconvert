// Node 端验证 unlock-music WASM（@clamber_l/crypto）的调用方式
// 用法：node test-um.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const um = await import(pathToFileURL(join(here, '..', 'vendor', 'um', 'loader.mjs')).href);

// 用 initSync 直接喂 wasm 字节，避免 Node 里 fetch file:// 的问题
const wasmBytes = readFileSync(join(here, '..', 'vendor', 'um', 'um_wasm_bg.wasm'));
um.initSync({ module: new WebAssembly.Module(wasmBytes) });
await um.ready;
console.log('UM_VERSION:', um.getUmcVersion());

// 1. NCMFile：垃圾数据应返回 -1
const f = new um.NCMFile();
const r = f.open(new Uint8Array(1024));
console.log('NCM_OPEN_GARBAGE:', r, '(期望 -1)');

// 2. decryptQMC1：XOR 对称性往返测试
const orig = new Uint8Array(4096);
for (let i = 0; i < orig.length; i++) orig[i] = (i * 7 + 13) & 0xff;
const copy = orig.slice();
um.decryptQMC1(copy, 0);
let changed = 0;
for (let i = 0; i < orig.length; i++) if (copy[i] !== orig[i]) changed++;
console.log('QMC1_CHANGED_AFTER_ENC:', changed, '/4096 (期望 ≈4096)');
um.decryptQMC1(copy, 0);
let same = true;
for (let i = 0; i < orig.length; i++) if (copy[i] !== orig[i]) same = false;
console.log('QMC1_ROUNDTRIP_SAME:', same, '(期望 true)');

// 3. detectAudioType：mp3 头
const mp3 = new Uint8Array(1024);
mp3.set([0x49, 0x44, 0x33, 0x03, 0x00]); // "ID3"
const at = um.detectAudioType(mp3);
console.log('DETECT_ID3:', at.audioType, '(期望 mp3)');

const flac = new Uint8Array(1024);
flac.set([0x66, 0x4c, 0x61, 0x43]); // "fLaC"
console.log('DETECT_FLAC:', um.detectAudioType(flac).audioType, '(期望 flac)');

// 4. QMCFooter：垃圾尾部应返回 undefined
const foot = um.QMCFooter.parse(new Uint8Array(1024));
console.log('QMCFOOTER_GARBAGE:', foot === undefined ? 'undefined (期望)' : typeof foot);

// 5. KuGou：垃圾头应抛异常（被我们捕获）
try {
  um.KuGou.from_header(new Uint8Array(1024));
  console.log('KUGOU_GARBAGE: no throw (意外)');
} catch (e) {
  console.log('KUGOU_GARBAGE_THROWS: true (期望 true)');
}

console.log('ALL_DONE');
