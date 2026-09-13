// 诊断真实 KGMA 文件：头部结构 + KuGou WASM 解析行为
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const um = await import(pathToFileURL(join(here, '..', '..', 'tools', 'ref-clamber', 'package', 'dist', 'loader.mjs')).href);
const wasmBytes = readFileSync(join(here, '..', '..', 'tools', 'ref-clamber', 'package', 'dist', 'um_wasm_bg.wasm'));
um.initSync({ module: new WebAssembly.Module(wasmBytes) });
await um.ready;

const path = process.argv[2];
const buf = new Uint8Array(readFileSync(path));
console.log('FILE_SIZE:', buf.length);

function hex(a, b) {
  let s = '';
  for (let i = a; i < Math.min(b, buf.length); i++) s += buf[i].toString(16).padStart(2, '0') + ' ';
  return s;
}
function ascii(a, b) {
  let s = '';
  for (let i = a; i < Math.min(b, buf.length); i++) {
    const c = buf[i];
    s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : '.';
  }
  return s;
}

console.log('HEAD 0x00-0x40 hex :', hex(0, 0x40));
console.log('HEAD ascii         :', ascii(0, 0x40));
console.log('HEAD 0x40-0x80 hex :', hex(0x40, 0x80));
console.log('HEAD 0x100 hex     :', hex(0x100, 0x140));
console.log('TAIL 0x00-0x40 hex :', hex(buf.length - 0x40, buf.length));

// KuGouHeader 解析（0x400 头）
try {
  const kh = new um.KuGouHeader(buf.subarray(0, 0x400));
  console.log('KuGouHeader OK: version=', kh.version, ' offsetToData=', kh.offsetToData, ' audioHash=', String(kh.audioHash).slice(0, 32));
} catch (e) {
  console.log('KuGouHeader THROW:', (e.message || e).slice(0, 120));
}

// KuGou.from_header
try {
  const kg = um.KuGou.from_header(buf.subarray(0, 0x400));
  console.log('KuGou.from_header OK');
  // 尝试按 offsetToData 解密前 4KB 并嗅探
  const kh2 = new um.KuGouHeader(buf.subarray(0, 0x400));
  const off = kh2.offsetToData;
  const probe = buf.slice(off, off + 4096);
  kg.decrypt(probe, off);
  console.log('DECRYPTED HEAD hex :', hex.call(null, 0, 0x10).length ? Array.from(probe.slice(0, 16)).map((x) => x.toString(16).padStart(2, '0')).join(' ') : '');
  const at = um.detectAudioType(probe);
  console.log('DETECT after decrypt:', at.audioType, ' needMore=', at.needMore);
} catch (e) {
  console.log('KuGou.from_header THROW:', (e.message || e).slice(0, 160));
}

// detectAudioType 直接嗅探原文件头
try {
  const at0 = um.detectAudioType(buf.slice(0, 1024));
  console.log('DETECT raw file:', at0.audioType, ' needMore=', at0.needMore);
} catch (e) {
  console.log('DETECT raw THROW:', (e.message || e).slice(0, 120));
}
console.log('DONE');
