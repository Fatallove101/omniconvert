// 定位 CBC 加密/解密不对称
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sandbox = { window: { App: {} }, console, TextDecoder, TextEncoder, setTimeout, clearTimeout, atob, btoa, WebAssembly };
sandbox.globalThis = sandbox;
for (const f of ['js/md5.js', 'js/aes.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(here, '..', f), 'utf8'), sandbox, { filename: f });
}
const App = sandbox.window.App;
const hex = (a) => Array.from(a).map((x) => x.toString(16).padStart(2, '0')).join(' ');

const iv = App.md5(new TextEncoder().encode('iv-seed-test'));
const key = App.md5(new TextEncoder().encode('key-seed-test'));
const P = new Uint8Array(32);
for (let i = 0; i < 32; i++) P[i] = i;

(async () => {
  const kc = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt']);
  const xored = P.slice(0, 16);
  for (let i = 0; i < 16; i++) xored[i] ^= iv[i];
  const full = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, kc, xored));
  const C1 = full.slice(0, 16);
  console.log('P[0:16]  :', hex(P.slice(0, 16)));
  console.log('C1       :', hex(C1));
  const out = App.aesCbcDecryptNoPad(C1.slice(), key, iv);
  console.log('DEC[0:16]:', hex(out.slice(0, 16)));

  const buf2 = new Uint8Array(32);
  buf2.set(C1, 0);
  buf2.set(P.slice(16, 32), 16);
  const out2 = App.aesCbcDecryptNoPad(buf2, key, iv);
  console.log('CBC DEC  :', hex(out2.slice(0, 16)), '|', hex(out2.slice(16, 32)));
})();
