// md5.js / aes.js / kgg-db.js 自检（NIST 向量 + 合成密钥库往返）
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const require2 = createRequire(import.meta.url);

const sandbox = { window: { App: {}, initSqlJs: undefined }, console, TextDecoder, TextEncoder, setTimeout, clearTimeout, atob, btoa, WebAssembly };
sandbox.globalThis = sandbox;
const vmRequire = (spec) => require2(spec);
sandbox.require = vmRequire;

// 加载 md5.js / aes.js / kgg-db.js（正式发布代码）
for (const f of ['js/md5.js', 'js/aes.js', 'js/kgg-db.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}
const App = sandbox.window.App;
let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); }
}

// 1. MD5 标准向量
check('md5("")', App.md5hex(new Uint8Array(0)) === 'd41d8cd98f00b204e9800998ecf8427e');
check('md5("abc")', App.md5hex(new TextEncoder().encode('abc')) === '900150983cd24fb0d6963f7d28e17f72');
check('md5 long', App.md5hex(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')) === '9e107d9d372bb6826bd81d3542a419d6');

// 2. AES-128 NIST 向量（FIPS-197 C.1）
// key 000102030405060708090a0b0c0d0e0f, 密文 69c4e0d86a7b0430d8cdb78070b4c55a → 明文 00112233445566778899aabbccddeeff
const key = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const nistCipher = Uint8Array.from([0x69, 0xc4, 0xe0, 0xd8, 0x6a, 0x7b, 0x04, 0x30, 0xd8, 0xcd, 0xb7, 0x80, 0x70, 0xb4, 0xc5, 0x5a]);
const nistPlain = Uint8Array.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
const iv0 = new Uint8Array(16);
const dec = App.aesCbcDecryptNoPad(nistCipher, key, iv0);
check('AES NIST C.1', dec.every((b, i) => b === nistPlain[i]));

// 3. 合成密钥库往返：sql.js 建库 → 按页加密（.NET/无外部依赖：用反向构造不可行，改用 node webcrypto 加密再补 padding 裁剪）
//    直接方案：用 webcrypto AES-CBC 加密 1008 字节（输出 1024 含 PKCS7），裁掉尾部 16 字节 padding 块不可行；
//    正确方案：CBC 加密可用「ECB 加密」组合，这里用 webcrypto 的 CBC 对“前块 XOR”序列逐块实现：
//    C_i = AES_ECB(P_i xor C_{i-1})。利用 webcrypto CBC：encrypt(IV=C_{i-1}, 明文 P_i xor C_{i-1}) 的首块即 ECB 结果。
async function cbcEncryptNoPad(plaintext, key, iv) {
  const kc = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  const out = new Uint8Array(plaintext.length);
  let prev = iv.slice(0, 16);
  const blocks = plaintext.length / 16;
  for (let bi = 0; bi < blocks; bi++) {
    /* webcrypto CBC 自带 P_i^IV 异或，输出首块即 C_i（第二块是 PKCS7 填充，丢弃） */
    const buf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: prev }, kc, plaintext.slice(bi * 16, bi * 16 + 16));
    const full = new Uint8Array(buf);
    out.set(full.subarray(0, 16), bi * 16);
    prev = full.subarray(0, 16);
  }
  return out;
}

// 3a. sql.js 建库
const realInit = require2(path.join(root, 'vendor', 'sqljs', 'sql-wasm.js'));
sandbox.window.initSqlJs = (cfg) => realInit({ ...cfg, locateFile: () => path.join(root, 'vendor', 'sqljs', 'sql-wasm.wasm') });
const SQL = await sandbox.window.initSqlJs();
const db = new SQL.Database();
db.run('CREATE TABLE ShareFileItems (EncryptionKeyId TEXT, EncryptionKey TEXT);');
const q1 = db.prepare('INSERT INTO ShareFileItems VALUES (?, ?);');
q1.run(['hashAAA', 'ekeyAAA123']);
q1.run(['hashBBB', 'ekeyBBB456']);
q1.free();
const plainDb = new Uint8Array(db.export());
db.close();
console.log('PLAIN_DB_SIZE:', plainDb.length, ' padding to 1024 multiple:', plainDb.length % 1024 === 0);

// 3b. 补齐到 1024 整数倍（sqlite export 一般已对齐；不足则补零页）
const pages = Math.ceil(plainDb.length / 1024);
const padded = new Uint8Array(pages * 1024);
padded.set(plainDb);

// 3c. 逐页加密（第 1 页按 KGG 特殊布局）
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
  const mk = Uint8Array.from([0x1d, 0x61, 0x31, 0x45, 0xb2, 0x47, 0xbf, 0x7f, 0x3d, 0x18, 0x96, 0x72, 0x14, 0x4f, 0xe4, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x73, 0x41, 0x6c, 0x54]);
  new DataView(mk.buffer).setUint32(0x10, page >>> 0, true);
  return App.md5(mk);
}
const encDb = new Uint8Array(padded.length);
for (let page = 1; page <= pages; page++) {
  const start = (page - 1) * 1024;
  const key = derivePageKey(page);
  const iv = derivePageIv(page);
  if (page === 1) {
    const p1 = padded.slice(0, 1024);
    // TriAgent 布局：[0:8]任意, [8:0x10]=C1, [0x10:0x18]=期望头(=明文[0x10:0x18]), [0x18:]=C2..
    const encRegion = await cbcEncryptNoPad(p1.slice(0x10), key, iv); // 1008 字节 = C1..C63
    encDb.set(p1.slice(0, 8), start);
    encDb.set(encRegion.subarray(0, 8), start + 8);
    encDb.set(p1.slice(0x10, 0x18), start + 0x10);
    encDb.set(encRegion.subarray(8), start + 0x18);
  } else {
    const encRegion = await cbcEncryptNoPad(padded.slice(start, start + 1024), key, iv);
    encDb.set(encRegion, start);
  }
}

// 3d. 解密 + 提取
const decDb = App.decryptKggDb(encDb);
check('DB sqlite header restored', new TextDecoder().decode(decDb.slice(0, 15)) === 'SQLite format 3');
const mapping = await App.extractKggKeyMapping(decDb);
check('DB key AAA', mapping['hashAAA'] === 'ekeyAAA123');
check('DB key BBB', mapping['hashBBB'] === 'ekeyBBB456');

console.log(`RESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
