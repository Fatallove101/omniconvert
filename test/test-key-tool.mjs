// 自检：「密钥格式转换」工具层
//  ① 改名后旧链接仍可用（#/tool/kgg-convert → key-decrypt）
//  ② 两个工具的扩展名分组与 test/check-music.mjs 的集合严格一致（防止文档/体检/工具三方漂移）
//  ③ 三种平台的密钥引导文案齐全（酷狗密钥库路径 / QQ musicex+客户端侧导出 / 酷我），且都是「方式一（推荐）+ 方式二」结构
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { KEY_NEEDED_EXTS, OFFLINE_ONLY_EXTS, KEY_HINTS } from './check-music.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

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

/* ---------- 最小 DOM 桩：app.js 加载期只需要注册 DOMContentLoaded ---------- */
const docListeners = {};
const document = {
  title: '',
  documentElement: { classList: { add() {}, remove() {}, toggle: () => false, contains: () => false } },
  body: { appendChild() {}, removeChild() {} },
  addEventListener(t, fn) {
    (docListeners[t] = docListeners[t] || []).push(fn);
  },
  removeEventListener() {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {} }),
};
const window = {
  addEventListener() {},
  localStorage: { getItem: () => null, setItem() {} },
  navigator: {},
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  location: { hash: '', hostname: 'localhost', protocol: 'http:' },
};
const sandbox = {
  window,
  document,
  location: window.location,
  localStorage: window.localStorage,
  navigator: window.navigator,
  requestAnimationFrame: window.requestAnimationFrame,
  performance,
  console,
  setTimeout,
  clearTimeout,
  Promise,
  Uint8Array,
  DataView,
  Blob,
  TextDecoder,
  TextEncoder,
  URL,
  fetch: async () => ({ ok: false, status: 404 }),
  PDFLib: { PDFDocument: {}, degrees: (d) => ({ angle: d }), rgb: () => ({}) },
};
sandbox.globalThis = sandbox;
const LOAD = [
  'js/app.js',
  'js/kgg-decoder.js',
  'js/tools/pdf-tools.js',
  'js/tools/image-tools.js',
  'js/tools/doc-tools.js',
  'js/tools/music-tools.js',
];
for (const f of LOAD) vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });

const App = window.App;
check('app.js 加载成功且带 getTool', !!App && typeof App.getTool === 'function');

/* ---------- ① 旧链接兼容 ---------- */
const legacy = App.getTool('kgg-convert');
check('旧 id kgg-convert 仍能解析到工具（老书签不失效）', !!legacy && legacy.id === 'key-decrypt', legacy ? legacy.id : 'null');
check('新 id key-decrypt 解析正常且名字是「密钥格式转换」', (App.getTool('key-decrypt') || {}).name === '密钥格式转换');

/* ---------- ② 扩展名分组与体检脚本一致 ---------- */
const extsOf = (t) =>
  String(t.accept || '')
    .split(',')
    .map((s) => s.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean)
    .sort();

const keyTool = App.getTool('key-decrypt');
const offTool = App.getTool('music-decrypt');
check(
  '「密钥格式转换」接受的扩展名 = 体检脚本的 KEY_NEEDED_EXTS',
  JSON.stringify(extsOf(keyTool)) === JSON.stringify([...KEY_NEEDED_EXTS].sort()),
  extsOf(keyTool).join(',') + ' vs ' + [...KEY_NEEDED_EXTS].sort().join(',')
);
check(
  '「歌曲格式转换」接受的扩展名 = 体检脚本的 OFFLINE_ONLY_EXTS',
  JSON.stringify(extsOf(offTool)) === JSON.stringify([...OFFLINE_ONLY_EXTS].sort()),
  extsOf(offTool).join(',') + ' vs ' + [...OFFLINE_ONLY_EXTS].sort().join(',')
);
check('两个工具都在「歌曲转换」栏目下', keyTool.category === 'music' && offTool.category === 'music');
check('“可转出”提示写清了需要密钥', /eKey|密钥/.test(keyTool.outputText || ''), keyTool.outputText);
check('描述里点明覆盖的平台与格式', /酷狗/.test(keyTool.desc) && /QQ/.test(keyTool.desc) && /酷我/.test(keyTool.desc) && /mmp4/.test(keyTool.desc) && /kwms/.test(keyTool.desc), keyTool.desc);

/* ---------- ③ 三种平台的密钥引导文案 ---------- */
const D = App.KEY_DIALOGS || {};
check('KEY_DIALOGS 覆盖酷狗 / QQ / 酷我三种 kind', !!D.kgg && !!D.qmc && !!D.kwm, Object.keys(D).join(','));
for (const [kind, want] of [
  ['kgg', /KGMusicV3\.db/],
  ['qmc', /musicex/],
  ['kwm', /酷我/],
]) {
  const d = D[kind] || {};
  const text = [d.title, d.lead, d.way1, d.way2].join('\n');
  check(`${kind}：引导含「方式一（推荐）」`, /方式一（推荐）/.test(text));
  check(`${kind}：引导含「方式二」手动粘贴`, /方式二/.test(text));
  check(`${kind}：引导含平台关键信息`, want.test(text), text.slice(0, 80));
}
check('只有酷狗引导带密钥库文件选择器', D.kgg.db === true && D.qmc.db === false && D.kwm.db === false);
check('QQ 引导说明了“本页面无法挂客户端取密钥”的原因', /纯浏览器|无法挂到客户端进程/.test(D.qmc.lead + D.qmc.way1), D.qmc.lead.slice(0, 60));
check('三种 kind 都有弹窗与体检脚本一致的取密钥说法', ['kugou', 'qq', 'kuwo'].every((k) => !!KEY_HINTS[k]));
check('弹窗接口存在且旧名兼容', typeof App.askMusicEkey === 'function' && typeof App.askKggEkey === 'function');

/* ---------- 工具总数不变（25），且分类未变 ---------- */
check('工具注册仍为 25 个（改名不改变数量）', App.tools.length === 25, 'tools=' + App.tools.length);

console.log('');
if (fail) {
  console.log('===== 失败明细 =====');
  for (const f of failures) console.log('- ' + f);
}
console.log(`RESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
