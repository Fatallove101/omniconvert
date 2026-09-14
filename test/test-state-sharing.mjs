// 自检：框架状态共享（App.state 在框架与工具之间必须是同一个对象）
// 背景：js/app.js 末尾以 Object.assign 合并挂载 window.App（浅拷贝），
//       而 renderHome/renderTool 会整体重新赋值 App.state → 工具侧 window.App.state 变成旧对象，
//       导致「PDF 页面重排」必然报错、「图片转 PDF」静默丢失排序/旋转。
// 本脚本用最小 DOM 桩加载**真实**的 js/app.js + js/tools/pdf-tools.js，
// 走真实调用路径：route → renderTool → addFiles → renderOrganizer → movePage/rotatePage → tool.run
// 引擎（pdf.js / pdf-lib）用桩替代，只验证状态流转与页码顺序是否正确传到工具。
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

/* ---------- 最小 DOM 桩 ---------- */
function makeCtx() {
  return {
    fillStyle: '',
    font: '',
    textBaseline: '',
    fillRect() {},
    fillText() {},
    drawImage() {},
    translate() {},
    rotate() {},
    measureText: () => ({ width: 100 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
  };
}

function makeElement(sel) {
  const el = {
    _sel: sel,
    innerHTML: '',
    textContent: '',
    hidden: false,
    disabled: false,
    value: '',
    files: [],
    type: 'text',
    placeholder: '',
    width: 0,
    height: 0,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle: () => false, contains: () => false },
    addEventListener() {},
    removeEventListener() {},
    remove() {},
    appendChild() {},
    querySelector: (s) => makeElement(s),
    querySelectorAll: () => [],
    setAttribute() {},
    focus() {},
    click() {},
    getContext: () => makeCtx(),
    toDataURL: () => 'data:image/jpeg;base64,AAAA',
  };
  return el;
}

const cache = new Map();
function el(sel) {
  if (!cache.has(sel)) cache.set(sel, makeElement(sel));
  return cache.get(sel);
}

const docListeners = {};
const document = {
  title: '',
  documentElement: { classList: { add() {}, remove() {}, toggle: () => false, contains: () => false } },
  body: makeElement('body'),
  addEventListener(type, fn) {
    (docListeners[type] = docListeners[type] || []).push(fn);
  },
  removeEventListener() {},
  getElementById: () => null,
  querySelector: (sel) => el(sel),
  querySelectorAll: () => [],
  createElement: (tag) => makeElement(tag),
};

/* ---------- 假 PDF 文档 / pdf.js / pdf-lib ---------- */
const fakePdf = {
  numPages: 2,
  getPage: async (i) => ({
    getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale }),
    render: () => ({ promise: Promise.resolve() }),
  }),
};

const copiedIdxs = [];
const addedPages = [];
function makeOutDoc() {
  return {
    async copyPages(src, idxs) {
      copiedIdxs.push(...idxs);
      return idxs.map((i) => ({
        _src: i,
        _rot: 0,
        getRotation() {
          return { angle: this._rot };
        },
        setRotation(r) {
          this._rot = r.angle;
        },
      }));
    },
    addPage(p) {
      addedPages.push(p);
    },
    async save() {
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]); /* %PDF */
    },
  };
}

const winListeners = {};
const window = {
  addEventListener(type, fn) {
    (winListeners[type] = winListeners[type] || []).push(fn);
  },
  matchMedia: () => ({ matches: false }),
  localStorage: {
    _d: {},
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null;
    },
    setItem(k, v) {
      this._d[k] = String(v);
    },
  },
  navigator: {}, /* 无 serviceWorker：跳过 SW 分支 */
  requestAnimationFrame: (cb) => setTimeout(() => cb(), 0),
  location: { hash: '', hostname: 'localhost', protocol: 'http:' },
};

const sandbox = {
  window,
  document,
  location: window.location,
  navigator: window.navigator,
  localStorage: window.localStorage,
  requestAnimationFrame: window.requestAnimationFrame,
  performance,
  console,
  setTimeout,
  clearTimeout,
  Promise,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  Uint8ClampedArray,
  DataView,
  ArrayBuffer,
  Blob,
  URL,
  fetch: async () => ({ ok: false, status: 404 }),
  /* 引擎桩：pdf.js 与 pdf-lib（本自检只关心状态流转） */
  pdfjsLib: { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve(fakePdf) }) },
  PDFLib: {
    PDFDocument: { create: async () => makeOutDoc(), load: async () => ({ getPageIndices: () => [0, 1] }) },
    degrees: (d) => ({ angle: d }),
    rgb: () => ({}),
  },
};
sandbox.globalThis = sandbox;

/* ---------- 按 index.html 的顺序加载真实代码 ---------- */
const LOAD = [
  'js/app.js',
  'js/md5.js',
  'js/aes.js',
  'js/ooxml.js',
  'js/kgg-decoder.js',
  'js/kgg-db.js',
  'js/tools/pdf-tools.js',
  'js/tools/image-tools.js',
  'js/tools/doc-tools.js',
  'js/tools/music-tools.js',
];
for (const f of LOAD) {
  vm.runInNewContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}

const App = window.App;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

check('window.App 已挂载且有工具注册表', !!App && Array.isArray(App.tools) && App.tools.length === 25, App ? 'tools=' + App.tools.length : 'no App');

/* 回归保护：合并式挂载不能吃掉其它脚本后挂上来的成员（App.md5 等） */
check('App.md5 可调用（挂载顺序回归）', typeof App.md5 === 'function' && typeof App.md5hex === 'function');
check('App.aesCbcDecryptNoPad 可调用', typeof App.aesCbcDecryptNoPad === 'function');
check('App.decryptKggDb / extractKggKeyMapping 可调用', typeof App.decryptKggDb === 'function' && typeof App.extractKggKeyMapping === 'function');
check('App.KGG.parseHeader 可调用', !!(App.KGG && typeof App.KGG.parseHeader === 'function'));
check('工具侧与框架侧是同一个 App 对象（工具注册表可见）', App.tools.length === 25 && typeof App.resetState === 'function');

/* 1. 触发路由启动（等价浏览器 DOMContentLoaded） */
for (const fn of docListeners.DOMContentLoaded || []) fn();

/* 2. 进入「PDF 页面重排」工具页（等价点击首页卡片 / 改 hash） */
window.location.hash = '#/tool/pdf-organize';
for (const fn of winListeners.hashchange || []) fn();

check('框架已进入工具页（内部 state）', App.getTool('pdf-organize') !== null);
check(
  'state 共享：工具侧 App.state.toolId 应为 pdf-organize',
  App.state.toolId === 'pdf-organize',
  'window.App.state.toolId = ' + JSON.stringify(App.state.toolId)
);

/* 3. 选择文件（真实公共入口 App.addFiles） */
const fakeFile = { name: 'sample.pdf', size: 2048, type: 'application/pdf' };
App.readAsArrayBuffer = async () => new ArrayBuffer(32); /* 桩：替代 FileReader */
try {
  App.addFiles('pdf-organize', [fakeFile]);
  check(
    'state 共享：框架登记的文件，工具侧应能看到',
    App.state.files.length === 1,
    'window.App.state.files.length = ' + App.state.files.length
  );

  /* 4. 等缩略图生成完成（异步） */
  for (let i = 0; i < 60 && !(App.state.pages && App.state.pages.length); i++) await sleep(25);
  check(
    '缩略图状态对工具侧可见（pages 为 2 页）',
    !!App.state.pages && App.state.pages.length === 2,
    'window.App.state.pages = ' + JSON.stringify(App.state.pages)
  );

  /* 5. 模拟用户重排 + 旋转（拖拽/按钮走的是同一批公共方法） */
  App.movePage(0, 1);
  App.rotatePage(0);
  check(
    '重排结果对工具侧可见（顺序 [1,0]、首张旋转 90°）',
    !!App.state.pages && App.state.pages.map((p) => p.src).join(',') === '1,0' && App.state.pages[0].rot === 90,
    JSON.stringify(App.state.pages)
  );
} catch (e) {
  check('文件登记 / 缩略图 / 重排流程未抛错', false, '抛出：' + (e && e.message ? e.message : e));
}

/* 6. 真正跑一次工具：页码顺序与旋转必须传给工具 */
const tool = App.getTool('pdf-organize');
let runErr = null;
try {
  const results = await tool.run([fakeFile], {}, { setStatus() {}, setProgress() {} });
  check('工具运行成功并返回 1 个文件', results.length === 1 && /-reordered\.pdf$/.test(results[0].name), JSON.stringify(results.map((r) => r.name)));
  check('输出的页序 = 用户排好的顺序 [1,0]', copiedIdxs.join(',') === '1,0', 'copied=' + copiedIdxs.join(','));
  check('旋转已应用（首张 90°）', addedPages.length === 2 && addedPages[0]._rot === 90, 'rot=' + (addedPages[0] && addedPages[0]._rot));
} catch (e) {
  runErr = e;
  check('工具运行成功（不应抛错）', false, '抛出：' + (e && e.message ? e.message : e));
}

console.log('');
if (fail) {
  console.log('===== 失败明细 =====');
  for (const f of failures) console.log('- ' + f);
  if (runErr) console.log('- 用户可见症状：点「开始转换」会弹出「' + runErr.message + '」');
}
console.log(`RESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
