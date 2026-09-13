/* ============================================================
 * PDF 工具组 — 合并 / 拆分 / 转图片 / 图转PDF / 压缩 / 提文本 / 水印 / 旋转
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App;
  const { PDFDocument, degrees, rgb } = PDFLib;

  /** Uint8Array → Blob */
  function pdfBlob(bytes) {
    return new Blob([bytes], { type: 'application/pdf' });
  }

  /** 加载 PDF（忽略加密标记，尽量打开） */
  async function loadPdf(file) {
    const buf = await App.readAsArrayBuffer(file);
    try {
      return await PDFDocument.load(buf, { ignoreEncryption: true });
    } catch (e) {
      throw new Error(`${file.name} 不是有效的 PDF 文件`);
    }
  }

  /** 解析页码范围字符串 "1-3,5" → [ [1,2,3], [5] ]（1 基） */
  function parseRanges(str, pageCount) {
    const groups = [];
    for (const part of str.split(/[,，]/)) {
      const s = part.trim();
      if (!s) continue;
      const m = s.match(/^(\d+)\s*-\s*(\d+)$/) || s.match(/^(\d+)$/);
      if (!m) throw new Error(`无法识别页码范围：“${s}”`);
      let a = +m[1];
      let b = m[2] ? +m[2] : a;
      if (a > b) [a, b] = [b, a];
      if (a < 1 || b > pageCount) throw new Error(`页码范围 ${a}-${b} 超出文档页数（共 ${pageCount} 页）`);
      const g = [];
      for (let i = a; i <= b; i++) g.push(i - 1);
      groups.push(g);
    }
    if (!groups.length) throw new Error('请填写有效的页码范围，例如：1-3,5');
    return groups;
  }

  async function getPdfjsDoc(file) {
    const buf = await App.readAsArrayBuffer(file);
    return App.pdfjs().getDocument({ data: new Uint8Array(buf) }).promise;
  }

  /** 用 pdf.js 把某一页渲染为 canvas */
  async function renderPage(pdfDoc, pageNum, scale) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  /* ---------- 1. PDF 合并 ---------- */
  App.registerTool({
    id: 'pdf-merge',
    icon: '📎',
    name: 'PDF 合并',
    desc: '多个 PDF 合并为一个文件',
    keywords: 'merge join 合并 拼接',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: true,
    minFiles: 2,
    async run(files, opts, ctx) {
      ctx.setProgress(0.05);
      const out = await PDFDocument.create();
      for (let i = 0; i < files.length; i++) {
        ctx.setStatus(`合并 ${files[i].name}（${i + 1}/${files.length}）…`);
        const src = await loadPdf(files[i]);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
        ctx.setProgress((i + 1) / files.length * 0.9);
        await App.nextFrame();
      }
      ctx.setStatus('写入输出文件…');
      const bytes = await out.save();
      return [{ name: `merged-${App.nowStamp()}.pdf`, blob: pdfBlob(bytes) }];
    },
  });

  /* ---------- 2. PDF 拆分 ---------- */
  App.registerTool({
    id: 'pdf-split',
    icon: '✂️',
    name: 'PDF 拆分',
    desc: '每页拆为一个文件，或按页码范围拆分',
    keywords: 'split 拆分 分割 extract',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: false,
    options: [
      {
        key: 'mode', label: '拆分方式', type: 'select', default: 'each',
        choices: [
          { v: 'each', label: '每页一个文件' },
          { v: 'ranges', label: '按页码范围拆分' },
          { v: 'everyN', label: '每 N 页一组' },
        ],
      },
      { key: 'ranges', label: '页码范围（用逗号分隔，如 1-3,5）', type: 'text', default: '1-3', placeholder: '1-3,5' },
      { key: 'everyN', label: '每组页数 N', type: 'number', min: 1, default: 3 },
    ],
    async run(files, opts, ctx) {
      const file = files[0];
      ctx.setStatus('读取 PDF…');
      const src = await loadPdf(file);
      const n = src.getPageCount();
      const base = file.name.replace(/\.pdf$/i, '');

      let groups;
      if (opts.mode === 'ranges') {
        groups = parseRanges(opts.ranges, n);
      } else if (opts.mode === 'everyN') {
        const size = Math.max(1, Math.round(opts.everyN || 3));
        groups = [];
        for (let i = 0; i < n; i += size) {
          const g = [];
          for (let j = i; j < Math.min(i + size, n); j++) g.push(j);
          groups.push(g);
        }
      } else {
        groups = Array.from({ length: n }, (_, i) => [i]);
      }

      const results = [];
      for (let i = 0; i < groups.length; i++) {
        ctx.setStatus(`生成第 ${i + 1}/${groups.length} 个文件…`);
        ctx.setProgress((i + 0.5) / groups.length);
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, groups[i]);
        pages.forEach((p) => out.addPage(p));
        const bytes = await out.save();
        const label = groups[i].length === 1 ? `第${groups[i][0] + 1}页` : `${groups[i][0] + 1}-${groups[i][groups[i].length - 1] + 1}`;
        results.push({ name: `${base}-${label}.pdf`, blob: pdfBlob(bytes) });
        await App.nextFrame();
      }
      return results;
    },
  });

  /* ---------- 3. PDF 转图片 ---------- */
  App.registerTool({
    id: 'pdf-to-image',
    icon: '🏞️',
    name: 'PDF 转图片',
    desc: '把 PDF 每一页导出为 PNG / JPG 图片',
    keywords: 'pdf2image 转图片 截图 导出',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: false,
    options: [
      {
        key: 'format', label: '图片格式', type: 'select', default: 'png',
        choices: [
          { v: 'png', label: 'PNG（无损）' },
          { v: 'jpg', label: 'JPG（体积小）' },
        ],
      },
      {
        key: 'dpi', label: '分辨率（DPI）', type: 'select', default: '150',
        choices: [
          { v: '96', label: '96 DPI（屏幕）' },
          { v: '150', label: '150 DPI（推荐）' },
          { v: '300', label: '300 DPI（高清打印）' },
        ],
      },
      { key: 'quality', label: 'JPG 画质', type: 'range', min: 0.5, max: 1, step: 0.05, default: 0.9 },
    ],
    async run(files, opts, ctx) {
      const file = files[0];
      ctx.setStatus('读取 PDF…');
      const pdf = await getPdfjsDoc(file);
      const scale = parseInt(opts.dpi, 10) / 72;
      const mime = opts.format === 'jpg' ? 'image/jpeg' : 'image/png';
      const ext = opts.format === 'jpg' ? 'jpg' : 'png';
      const base = file.name.replace(/\.pdf$/i, '');
      const results = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        ctx.setStatus(`渲染第 ${i}/${pdf.numPages} 页…`);
        ctx.setProgress((i - 0.5) / pdf.numPages);
        const canvas = await renderPage(pdf, i, scale);
        const blob = await App.canvasToBlob(canvas, mime, opts.quality);
        results.push({ name: `${base}-第${i}页.${ext}`, blob });
        await App.nextFrame();
      }
      return results;
    },
  });

  /** 经画布重编码图片（浏览器不能直接嵌入的格式，或需要旋转时）；rot 为 90 的倍数 */
  async function reencodeJpeg(file, rot) {
    const img = await App.loadImageFile(file);
    const swapped = rot === 90 || rot === 270;
    const w = swapped ? img.height : img.width;
    const h = swapped ? img.width : img.height;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    return App.canvasToBlob(c, 'image/jpeg', 0.92);
  }

  /* ---------- 4. 图片转 PDF（支持拖拽排序/旋转/移除） ---------- */
  App.registerTool({
    id: 'image-to-pdf',
    icon: '📔',
    name: '图片转 PDF',
    desc: '多张图片合成 PDF，可拖拽调整顺序',
    keywords: 'img2pdf 图片 合成 pdf 扫描 排序',
    category: 'pdf',
    accept: '.jpg,.jpeg,.png,.webp,.bmp,.gif',
    acceptText: 'JPG / PNG / WebP / BMP / GIF 图片',
    multiple: true,
    minFiles: 1,
    organize: 'image',
    options: [
      {
        key: 'pageSize', label: '页面大小', type: 'select', default: 'fit',
        choices: [
          { v: 'fit', label: '跟随图片尺寸' },
          { v: 'a4', label: 'A4 纸张' },
        ],
      },
      {
        key: 'orientation', label: 'A4 方向', type: 'select', default: 'auto',
        choices: [
          { v: 'auto', label: '自动' },
          { v: 'portrait', label: '纵向' },
          { v: 'landscape', label: '横向' },
        ],
      },
      { key: 'margin', label: 'A4 页边距 (mm)', type: 'number', min: 0, max: 40, default: 0 },
    ],
    async run(files, opts, ctx) {
      const out = await PDFDocument.create();
      const MM = 72 / 25.4;

      /* 有排序器状态时按用户排好的顺序与旋转输出 */
      const pages =
        App.state.pages && App.state.pages.length
          ? App.state.pages
          : files.map((f, i) => ({ src: i, rot: 0 }));

      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const f = files[p.src];
        ctx.setStatus(`处理 ${f.name}（${i + 1}/${pages.length}）…`);
        ctx.setProgress((i + 0.2) / pages.length);

        const rot = (((p.rot || 0) % 360) + 360) % 360;
        let embed;
        if (rot === 0) {
          const bytes = new Uint8Array(await App.readAsArrayBuffer(f));
          if (/\.jpe?g$/i.test(f.name) || f.type === 'image/jpeg') {
            embed = await out.embedJpg(bytes);
          } else if (/\.png$/i.test(f.name) || f.type === 'image/png') {
            embed = await out.embedPng(bytes);
          } else {
            const b = await reencodeJpeg(f, 0);
            embed = await out.embedJpg(new Uint8Array(await b.arrayBuffer()));
          }
        } else {
          const b = await reencodeJpeg(f, rot);
          embed = await out.embedJpg(new Uint8Array(await b.arrayBuffer()));
        }

        let pageW, pageH;
        if (opts.pageSize === 'a4') {
          pageW = 210 * MM;
          pageH = 297 * MM;
          if (opts.orientation === 'landscape' || (opts.orientation === 'auto' && embed.width > embed.height)) {
            [pageW, pageH] = [pageH, pageW];
          }
        } else {
          pageW = embed.width * 0.75; /* 96dpi 像素 → 72pt */
          pageH = embed.height * 0.75;
        }

        const margin = (opts.margin || 0) * MM;
        const boxW = pageW - margin * 2;
        const boxH = pageH - margin * 2;
        const scale = Math.min(boxW / embed.width, boxH / embed.height);
        const w = embed.width * scale;
        const h = embed.height * scale;
        const page = out.addPage([pageW, pageH]);
        page.drawImage(embed, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
        ctx.setProgress((i + 0.9) / pages.length);
        await App.nextFrame();
      }

      ctx.setStatus('写入 PDF…');
      const bytes = await out.save();
      return [{ name: `images-${App.nowStamp()}.pdf`, blob: pdfBlob(bytes) }];
    },
  });

  /* ---------- 5. PDF 压缩 ---------- */
  App.registerTool({
    id: 'pdf-compress',
    icon: '🗜️',
    name: 'PDF 压缩',
    desc: '重新编码页面内容，大幅减小 PDF 体积',
    keywords: 'compress 压缩 减小体积',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: false,
    options: [
      {
        key: 'level', label: '压缩强度', type: 'select', default: 'balanced',
        choices: [
          { v: 'high', label: '轻度（画质优先）' },
          { v: 'balanced', label: '平衡（推荐）' },
          { v: 'strong', label: '强力（体积优先）' },
        ],
      },
    ],
    async run(files, opts, ctx) {
      const file = files[0];
      ctx.setStatus('读取 PDF…');
      const pdf = await getPdfjsDoc(file);
      const conf = { high: { scale: 2, q: 0.85 }, balanced: { scale: 1.5, q: 0.72 }, strong: { scale: 1.2, q: 0.5 } }[opts.level];

      const out = await PDFDocument.create();
      for (let i = 1; i <= pdf.numPages; i++) {
        ctx.setStatus(`重编码第 ${i}/${pdf.numPages} 页…`);
        ctx.setProgress((i - 0.7) / pdf.numPages);
        const canvas = await renderPage(pdf, i, conf.scale);
        const jpg = await App.canvasToBlob(canvas, 'image/jpeg', conf.q);
        const jpgBytes = new Uint8Array(await jpg.arrayBuffer());
        const embed = await out.embedJpg(jpgBytes);

        /* 以原始 PDF 点数（scale=1 viewport）为准 */
        const page1 = await pdf.getPage(i);
        const vp = page1.getViewport({ scale: 1 });
        const page = out.addPage([vp.width, vp.height]);
        page.drawImage(embed, { x: 0, y: 0, width: vp.width, height: vp.height });
        await App.nextFrame();
      }

      ctx.setStatus('写入输出文件…');
      const bytes = await out.save();
      const name = file.name.replace(/\.pdf$/i, '') + '-compressed.pdf';
      const orig = file.size;
      const now = bytes.length;
      if (now >= orig) {
        ctx.setStatus(
          `注意：原文件 ${App.formatSize(orig)}，重编码后 ${App.formatSize(now)}。该工具把页面转为图片重编码，更适合图片/扫描型 PDF`,
          true
        );
      } else {
        ctx.setStatus(
          `压缩完成：${App.formatSize(orig)} → ${App.formatSize(now)}（省 ${Math.round((1 - now / orig) * 100)}%）`,
          true
        );
      }
      return [{ name, blob: pdfBlob(bytes) }];
    },
  });

  /* ---------- 6. PDF 提取文本 ---------- */
  App.registerTool({
    id: 'pdf-extract-text',
    icon: '📝',
    name: 'PDF 提取文本',
    desc: '从 PDF 中提取全部文字，保存为 TXT',
    keywords: 'text 提取文字 复制 ocr txt',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: false,
    async run(files, opts, ctx) {
      const file = files[0];
      ctx.setStatus('读取 PDF…');
      const pdf = await getPdfjsDoc(file);
      const pages = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        ctx.setStatus(`提取第 ${i}/${pdf.numPages} 页文本…`);
        ctx.setProgress(i / pdf.numPages);
        const page = await pdf.getPage(i);
        const tc = await page.getTextContent();
        let text = '';
        for (const item of tc.items) {
          if (typeof item.str !== 'string') continue;
          text += item.str + (item.hasEOL ? '\n' : '');
        }
        pages.push(text.trim());
        await App.nextFrame();
      }

      const full = pages.join('\n\n');
      if (!full.replace(/\s/g, '')) {
        throw new Error('未能提取到文本：该 PDF 可能是扫描图片（需 OCR，暂不支持）');
      }
      const name = file.name.replace(/\.pdf$/i, '') + '.txt';
      return [{ name, blob: new Blob(['\ufeff' + full], { type: 'text/plain;charset=utf-8' }) }];
    },
  });

  /* ---------- 7. PDF 水印 ---------- */
  App.registerTool({
    id: 'pdf-watermark',
    icon: '💧',
    name: 'PDF 加水印',
    desc: '给每一页添加文字水印（支持中文）',
    keywords: 'watermark 水印 版权 保护',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: false,
    options: [
      { key: 'text', label: '水印文字', type: 'text', default: '机密文件', placeholder: '如：内部资料' },
      { key: 'opacity', label: '不透明度', type: 'range', min: 0.05, max: 1, step: 0.05, default: 0.2 },
      { key: 'angle', label: '旋转角度', type: 'range', min: 0, max: 90, step: 5, default: 45 },
      {
        key: 'color', label: '颜色', type: 'select', default: 'gray',
        choices: [
          { v: 'gray', label: '灰色' },
          { v: 'black', label: '黑色' },
          { v: 'red', label: '红色' },
          { v: 'blue', label: '蓝色' },
        ],
      },
    ],
    async run(files, opts, ctx) {
      const text = (opts.text || '').trim();
      if (!text) throw new Error('请填写水印文字');
      const file = files[0];
      ctx.setStatus('读取 PDF…');
      const src = await loadPdf(file);

      /* 文字先画到画布再以 PNG 嵌入 —— 以此支持中文与任意字符 */
      const fontSize = 64;
      const measure = document.createElement('canvas').getContext('2d');
      measure.font = `bold ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      const tw = Math.ceil(measure.measureText(text).width);
      const cv = document.createElement('canvas');
      cv.width = tw + 24;
      cv.height = Math.ceil(fontSize * 1.4);
      const c2 = cv.getContext('2d');
      c2.font = `bold ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      c2.textBaseline = 'middle';
      c2.fillStyle = '#000000';
      c2.fillText(text, 12, cv.height / 2);
      const pngBlob = await App.canvasToBlob(cv, 'image/png');
      const embed = await src.embedPng(new Uint8Array(await pngBlob.arrayBuffer()));

      const colors = { gray: rgb(0.45, 0.45, 0.45), black: rgb(0, 0, 0), red: rgb(0.85, 0.1, 0.1), blue: rgb(0.1, 0.3, 0.85) };
      const angle = degrees(opts.angle || 45);
      src.getPages().forEach((page, idx) => {
        const { width, height } = page.getSize();
        const scale = Math.min((width * 0.8) / cv.width, (height * 0.5) / cv.height);
        const w = cv.width * scale;
        const h = cv.height * scale;
        ctx.setStatus(`写入第 ${idx + 1} 页水印…`);
        page.drawImage(embed, {
          x: width / 2,
          y: height / 2,
          width: w,
          height: h,
          rotate: angle,
          opacity: opts.opacity,
        });
      });

      ctx.setStatus('写入输出文件…');
      const bytes = await src.save();
      const name = file.name.replace(/\.pdf$/i, '') + '-watermark.pdf';
      return [{ name, blob: pdfBlob(bytes) }];
    },
  });

  /* ---------- 8. PDF 加密（qpdf WASM，AES-256） ---------- */

  /** 运行一次 qpdf 命令：写入 /in.pdf，返回 /out.pdf 与退出码 */
  async function qpdfRun(args, inputBytes) {
    const mod = await App.qpdf();
    /* 清理上一轮的临时文件 */
    mod.FS.readdir('/').forEach((f) => {
      if (f === '.' || f === '..') return;
      try {
        if (mod.FS.isFile(mod.FS.stat('/' + f).mode)) mod.FS.unlink('/' + f);
      } catch (e) { /* 忽略 */ }
    });
    mod.FS.writeFile('/in.pdf', inputBytes);
    App._qpdfOut.length = 0;
    App._qpdfErr.length = 0;
    let code = 0;
    try {
      mod.callMain(args);
    } catch (e) {
      /* Emscripten 以 ExitStatus 结束 callMain，status 即退出码 */
      code = e && typeof e.status === 'number' ? e.status : 1;
    }
    let out = null;
    try {
      out = mod.FS.readFile('/out.pdf');
    } catch (e) { /* 未产出输出 */ }
    return { code, out, errText: App._qpdfErr.join('\n'), outText: App._qpdfOut.join('\n') };
  }

  App.registerTool({
    id: 'pdf-encrypt',
    icon: '🔒',
    name: 'PDF 加密',
    desc: '给 PDF 添加密码保护（AES-256）',
    keywords: 'encrypt 加密 密码 保护 安全',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: false,
    options: [
      { key: 'password', label: '打开密码（必填）', type: 'text', default: '', placeholder: '接收者打开文件时输入' },
      { key: 'owner', label: '权限密码（留空则与打开密码相同）', type: 'text', default: '', placeholder: '用于解除限制' },
    ],
    async run(files, opts, ctx) {
      const pw = (opts.password || '').trim();
      if (!pw) throw new Error('请填写打开密码');
      const owner = (opts.owner || '').trim() || pw;
      ctx.setStatus('加载加密引擎（qpdf WASM）…');
      const bytes = new Uint8Array(await App.readAsArrayBuffer(files[0]));
      const r = await qpdfRun(['--encrypt', pw, owner, '256', '--', '/in.pdf', '/out.pdf'], bytes);
      if (!r.out) throw new Error('加密失败：' + (r.errText.split('\n').pop() || '退出码 ' + r.code));
      const name = files[0].name.replace(/\.pdf$/i, '') + '-encrypted.pdf';
      ctx.setStatus('加密完成（AES-256，已生效）', true);
      return [{ name, blob: pdfBlob(r.out) }];
    },
  });

  /* ---------- 9. PDF 解密 ---------- */
  App.registerTool({
    id: 'pdf-decrypt',
    icon: '🔓',
    name: 'PDF 解密',
    desc: '移除 PDF 的密码保护（需已知密码）',
    keywords: 'decrypt 解密 去除密码 解锁 unlock',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: false,
    options: [
      { key: 'password', label: '密码（打开密码；仅限制权限的文件可留空）', type: 'text', default: '', placeholder: '已知密码' },
    ],
    async run(files, opts, ctx) {
      const pw = (opts.password || '').trim();
      ctx.setStatus('加载解密引擎（qpdf WASM）…');
      const bytes = new Uint8Array(await App.readAsArrayBuffer(files[0]));
      const args = ['--decrypt'];
      if (pw) args.push('--password=' + pw);
      args.push('/in.pdf', '/out.pdf');
      const r = await qpdfRun(args, bytes);
      if (!r.out) throw new Error('解密失败：密码错误或文件损坏');
      const name = files[0].name.replace(/\.pdf$/i, '') + '-decrypted.pdf';
      ctx.setStatus('已移除密码保护', true);
      return [{ name, blob: pdfBlob(r.out) }];
    },
  });

  /* ---------- 10. PDF 页面重排 ---------- */
  App.registerTool({
    id: 'pdf-organize',
    icon: '🧩',
    name: 'PDF 页面重排',
    desc: '拖拽调整页面顺序，可删除或旋转页面',
    keywords: 'organize 重排 排序 拖拽 删除页面 页面管理 整理',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: false,
    organize: true,
    async run(files, opts, ctx) {
      if (!App.state.pages || !App.state.pages.length) {
        throw new Error('页面缩略图尚未生成完毕，请稍候再点“开始转换”');
      }
      ctx.setStatus('按新顺序生成 PDF…');
      ctx.setProgress(0.3);
      const file = files[0];
      const src = await loadPdf(file);
      const out = await PDFDocument.create();
      const idxs = App.state.pages.map((p) => p.src);
      const copied = await out.copyPages(src, idxs);
      copied.forEach((page, i) => {
        const rot = App.state.pages[i].rot;
        if (rot) page.setRotation(degrees(((page.getRotation().angle || 0) + rot) % 360));
        out.addPage(page);
      });
      ctx.setProgress(0.85);
      const bytes = await out.save();
      ctx.setStatus(`已按新顺序输出 ${App.state.pages.length} 页`, true);
      return [{ name: file.name.replace(/\.pdf$/i, '') + '-reordered.pdf', blob: pdfBlob(bytes) }];
    },
  });

  /* ---------- 11. PDF 旋转 ---------- */
  App.registerTool({
    id: 'pdf-rotate',
    icon: '🔄',
    name: 'PDF 旋转',
    desc: '旋转 PDF 的全部或部分页面',
    keywords: 'rotate 旋转 页面 方向',
    category: 'pdf',
    accept: '.pdf',
    acceptText: 'PDF 文件',
    multiple: false,
    options: [
      {
        key: 'angle', label: '旋转角度', type: 'select', default: '90',
        choices: [
          { v: '90', label: '顺时针 90°' },
          { v: '180', label: '180°' },
          { v: '270', label: '逆时针 90°' },
        ],
      },
      { key: 'pages', label: '页码（留空=全部，如 1-3,5）', type: 'text', default: '', placeholder: '1-3,5' },
    ],
    async run(files, opts, ctx) {
      const file = files[0];
      const src = await loadPdf(file);
      const pages = src.getPages();
      const n = pages.length;

      let targets;
      if ((opts.pages || '').trim()) {
        const groups = parseRanges(opts.pages, n);
        targets = new Set(groups.flat());
      } else {
        targets = new Set(pages.map((_, i) => i));
      }

      targets.forEach((idx) => {
        const cur = pages[idx].getRotation().angle || 0;
        pages[idx].setRotation(degrees((cur + parseInt(opts.angle, 10)) % 360));
      });

      ctx.setStatus('写入输出文件…');
      const bytes = await src.save();
      const name = file.name.replace(/\.pdf$/i, '') + '-rotated.pdf';
      return [{ name, blob: pdfBlob(bytes) }];
    },
  });
})();
