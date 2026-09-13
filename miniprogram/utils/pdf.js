// PDF 合并 / 拆分 —— 基于 pdf-lib 在端内完成
// 使用前请在微信开发者工具中执行：工具 → 构建 npm（详见 miniprogram/README.md）
let cachedLib = null;

function loadLib() {
  if (!cachedLib) {
    // 小程序环境缺 global 时补齐（部分 npm 包需要）
    if (typeof global === 'undefined') {
      // eslint-disable-next-line no-global-assign
      globalThis.global = globalThis;
    }
    cachedLib = require('pdf-lib');
  }
  return cachedLib;
}

const fsm = wx.getFileSystemManager();

function readFileBuf(path) {
  return new Promise((resolve, reject) =>
    fsm.readFile({ filePath: path, success: (r) => resolve(r.data), fail: reject })
  );
}

async function writeOut(bytes, name) {
  const path = `${wx.env.USER_DATA_PATH}/${name}`;
  await new Promise((resolve, reject) =>
    fsm.writeFile({ filePath: path, data: bytes, success: resolve, fail: reject })
  );
  return path;
}

/** 合并多个 PDF，返回输出文件路径 */
async function mergePdfs(paths, onProgress) {
  const { PDFDocument } = loadLib();
  const out = await PDFDocument.create();
  for (let i = 0; i < paths.length; i++) {
    onProgress && onProgress(`合并中 ${i + 1}/${paths.length}…`);
    const data = await readFileBuf(paths[i]);
    const doc = await PDFDocument.load(data, { ignoreEncryption: true });
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
  }
  const bytes = await out.save();
  return writeOut(bytes, `merged-${Date.now()}.pdf`);
}

/** 拆分 PDF（每页一个文件），返回输出路径数组 */
async function splitPdf(path, onProgress) {
  const { PDFDocument } = loadLib();
  const data = await readFileBuf(path);
  const src = await PDFDocument.load(data, { ignoreEncryption: true });
  const n = src.getPageCount();
  const outs = [];
  for (let i = 0; i < n; i++) {
    onProgress && onProgress(`拆分中 ${i + 1}/${n}…`);
    const doc = await PDFDocument.create();
    const [pg] = await doc.copyPages(src, [i]);
    doc.addPage(pg);
    const bytes = await doc.save();
    outs.push(await writeOut(bytes, `page-${i + 1}.pdf`));
  }
  return outs;
}

module.exports = { mergePdfs, splitPdf };
