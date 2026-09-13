// Node 端验证 js/kgg-decoder.js（正式发布代码）+ 真实 KGMA 文件
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'js', 'kgg-decoder.js'), 'utf8');
const sandbox = { window: { App: {} }, console, TextDecoder, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox, { filename: 'kgg-decoder.js' });
const KGG = sandbox.window.App.KGG;
console.log('MEND_LEN:', KGG.PUB_KEY_MEND.length, ' MAGIC ok:', KGG.KGM_MAGIC.length === 16);

const file = process.argv[2];
const buf = new Uint8Array(fs.readFileSync(file));

const h = KGG.parseHeader(buf.subarray(0, 0x400));
console.log('HEADER: version=' + h.version, 'audioOffset=' + h.audioOffset, 'slot=' + h.slot, 'hash=' + JSON.stringify(h.audioHash));

const pub = new Uint8Array(zlib.inflateRawSync(fs.readFileSync(path.join(here, '..', 'vendor', 'um', 'kugou-pubkey.deflate'))));
console.log('PUBKEY inflated:', pub.length);

const own = new Uint8Array(KGG.OWN_LEN);
own.set(h.testData);
const body = buf.slice(h.audioOffset);
const t0 = Date.now();
KGG.decodeV3(body, own, pub, 0);
console.log('DECODED in', (Date.now() - t0) + 'ms');

const magic = String.fromCharCode(...body.slice(0, 4));
console.log('OUT_MAGIC:', JSON.stringify(magic), '(期望 fLaC)');
const outPath = 'C:/1/omniconvert/test/output/战马(DJ默涵版)-kgg.flac';
fs.writeFileSync(outPath, body);
console.log('WROTE:', outPath, body.length, 'bytes');
