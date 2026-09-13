// 逐字节对比解密结果与原始库，定位 AAA 记录丢失点
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { window: { App: {}, initSqlJs: undefined }, console, TextDecoder, TextEncoder, setTimeout, clearTimeout, atob, btoa, WebAssembly };
sandbox.globalThis = sandbox;
const require2 = createRequire(pathToFileURL(path.join(here, 'x.js')));
sandbox.require = require2;
for (const f of ['js/md5.js', 'js/aes.js', 'js/kgg-db.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(here, '..', f), 'utf8'), sandbox, { filename: f });
}
const App = sandbox.window.App;
const realInit = require2(path.join(here, '..', 'vendor', 'sqljs', 'sql-wasm.js'));
sandbox.window.initSqlJs = (cfg) => realInit({ ...cfg, locateFile: () => path.join(here, '..', 'vendor', 'sqljs', 'sql-wasm.wasm') });
const SQL = await sandbox.window.initSqlJs();

const db = new SQL.Database();
db.run('CREATE TABLE ShareFileItems (EncryptionKeyId TEXT, EncryptionKey TEXT);');
const q = db.prepare('INSERT INTO ShareFileItems VALUES (?, ?);');
q.run(['hashAAA', 'ekeyAAA123abcdefgh12345678']);
q.run(['hashBBB', 'ekeyBBB456qrstuvwxyz98765432']);
q.free();
const plain = new Uint8Array(db.export());
db.close();
console.log('PLAIN_DB_SIZE:', plain.length);
console.log('plain[0:32] :', Array.from(plain.slice(0, 32)).map((x) => x.toString(16).padStart(2, '0')).join(' '));

const pages = Math.ceil(plain.length / 1024);
const padded = new Uint8Array(pages * 1024);
padded.set(plain);

function dIvS(s) {
  const l = Math.imul(s, 0x9ef4) >>> 0;
  const r = (Math.floor(s / 0xce26) * 0x7fffff07) % 0x100000000;
  const v = (l - r) >>> 0;
  if ((v & 0x80000000) === 0) return v >>> 0;
  return (v + 0x7fffff07) >>> 0;
}
function pIv(p) {
  const iv = new Uint8Array(16);
  const dv = new DataView(iv.buffer);
  let x = p + 1;
  for (let o = 0; o < 16; o += 4) {
    x = dIvS(x);
    dv.setUint32(o, x >>> 0, true);
  }
  return App.md5(iv);
}
function pKey(p) {
  const mk = Uint8Array.from([0x1d, 0x61, 0x31, 0x45, 0xb2, 0x47, 0xbf, 0x7f, 0x3d, 0x18, 0x96, 0x72, 0x14, 0x4f, 0xe4, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x73, 0x41, 0x6c, 0x54]);
  new DataView(mk.buffer).setUint32(0x10, p >>> 0, true);
  return App.md5(mk);
}

const encDb = new Uint8Array(padded.length);
(async () => {
  for (let page = 1; page <= pages; page++) {
    const start = (page - 1) * 1024;
    const key = pKey(page);
    const iv = pIv(page);
    const kc = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
    const pt = padded.slice(start, start + 1024);
    const raw = new Uint8Array(1024);
    let prev = iv.slice();
    const isP1 = page === 1;
    const nBlocks = isP1 ? 63 : 64;   /* 页 1 明文从 0x10 开始只有 1008 字节 */
    const base = isP1 ? 0x10 : 0;
    for (let b = 0; b < nBlocks; b++) {
      /* 标准 CBC：webcrypto 自己做 P⊕IV，不要再手动异或一次 */
      const full = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: prev }, kc, pt.slice(base + b * 16, base + b * 16 + 16)));
      raw.set(full.slice(0, 16), b * 16);
      prev = full.slice(0, 16);
    }
    encDb.set(pt.slice(0, 8), start);
    encDb.set(raw.subarray(0, 8), start + 8);
    if (isP1) {
      encDb.set(pt.slice(0x10, 0x18), start + 0x10);
      encDb.set(raw.subarray(8, 1008), start + 0x18);
    } else {
      encDb.set(raw, start);
    }
  }

  const dec = (() => {
    try {
      return App.decryptKggDb(encDb);
    } catch (e) {
      console.log('THROW:', e.message);
      // 手动复现第 1 页解密并打印
      const first = encDb.slice(0, 1024);
      const expectedHeader = first.slice(0x10, 0x18);
      const swap = first.slice(0x08, 0x10);
      console.log('file[0x08:0x20]:', Array.from(first.slice(8, 32)).map((x) => x.toString(16).padStart(2, '0')).join(' '));
      const ff = first.slice();
      ff.set(swap, 0x10);
      const decFirst = App.aesCbcDecryptNoPad(ff.subarray(0x10), App.md5(-1) && pKey(1), pIv(1));
      console.log('dec[0:16]  :', Array.from(decFirst.slice(0, 16)).map((x) => x.toString(16).padStart(2, '0')).join(' '));
      console.log('expected   :', Array.from(expectedHeader).map((x) => x.toString(16).padStart(2, '0')).join(' '), '(= 明文页[0x10:0x18])');
      console.log('plain p1[0x08:0x20]:', Array.from(padded.slice(8, 32)).map((x) => x.toString(16).padStart(2, '0')).join(' '));
      process.exit(1);
    }
  })();
  let same = true;
  for (let i = 0; i < plain.length; i++) {
    if (dec[i] !== plain[i]) {
      console.log('FIRST DIFF at byte', i, '(page', Math.floor(i / 1024) + 1, 'offset', i % 1024, ') dec:', dec[i], 'plain:', plain[i]);
      same = false;
      break;
    }
  }
  if (same) console.log('DECRYPTED == ORIGINAL exactly ✓');

  const find = (s) => {
    const b = new TextEncoder().encode(s);
    for (let i = 0; i <= dec.length - b.length; i++) {
      let ok = true;
      for (let j = 0; j < b.length; j++) if (dec[i + j] !== b[j]) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  };
  console.log('hashAAA at:', find('hashAAA'), ' hashBBB at:', find('hashBBB'), ' ekeyAAA at:', find('ekeyAAA123'));
  const map = await App.extractKggKeyMapping(dec);
  console.log('mapping:', JSON.stringify(map));
  process.exit(0);
})();
