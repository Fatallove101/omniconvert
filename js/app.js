/* ============================================================
 * 万象转换 OmniConvert — 核心应用框架
 * 纯浏览器端文件格式转换（零上传、可离线、PWA）
 * ============================================================ */
(function () {
  'use strict';

  const App = {
    tools: [],
    state: { toolId: null, files: [], results: [], busy: false },
    categories: [
      { id: 'all', label: '全部', icon: '🗂️' },
      { id: 'pdf', label: 'PDF', icon: '📕' },
      { id: 'image', label: '图片', icon: '🖼️' },
      { id: 'doc', label: '文档', icon: '📄' },
    ],
    filter: { cat: 'all', q: '' },
  };

  /* ---------- 通用工具函数 ---------- */

  App.$ = (sel, root) => (root || document).querySelector(sel);
  App.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  App.formatSize = function (n) {
    if (n == null) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };

  App.nowStamp = function () {
    const d = new Date();
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };

  App.outName = function (base, ext) {
    const stem = (base || 'output').replace(/\.[^.]+$/, '');
    return `${stem}.${ext}`;
  };

  App.nextFrame = function () {
    return new Promise((r) => requestAnimationFrame(() => r()));
  };

  App.readAsArrayBuffer = function (file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('读取文件失败: ' + file.name));
      r.readAsArrayBuffer(file);
    });
  };

  App.readAsText = function (file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('读取文件失败: ' + file.name));
      r.readAsText(file);
    });
  };

  App.canvasToBlob = function (canvas, type, quality) {
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画布导出失败'))), type, quality)
    );
  };

  /** 加载图片文件为 HTMLImageElement（含 HEIC 预转换交给调用方处理） */
  App.loadImage = async function (blob) {
    let src = blob;
    try {
      return await createImageBitmap(blob);
    } catch (e) {
      /* 退回 <img> 方案 */
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('图片解码失败'));
        img.src = url;
      });
      img.url = url;
      return img;
    }
  };

  /** 把任意图片源（ImageBitmap / HTMLImageElement）绘制到新 canvas */
  App.drawToCanvas = function (img, w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  };

  App.download = function (name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  };

  App.makeZip = async function (entries) {
    const zip = new JSZip();
    const used = new Set();
    for (const e of entries) {
      let name = e.name;
      let i = 2;
      while (used.has(name)) {
        const m = name.match(/^(.*?)(\.[^.]+)?$/);
        name = `${m[1]} (${i++})${m[2] || ''}`;
      }
      used.add(name);
      zip.file(name, e.blob);
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  };

  App.downloadZip = async function (entries, name) {
    App.setStatus('正在打包 ZIP…');
    const blob = await App.makeZip(entries);
    App.download(name, blob);
  };

  /** pdf.js 懒配置（worker 本地文件） */
  App.pdfjs = function () {
    if (!App._pdfjsReady) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      App._pdfjsReady = true;
    }
    return pdfjsLib;
  };

  /** qpdf WASM 懒加载（加密/解密引擎），单例 */
  App.qpdf = function () {
    if (!App._qpdfPromise) {
      App._qpdfOut = [];
      App._qpdfErr = [];
      App._qpdfPromise = window.Module({
        locateFile: () => 'vendor/qpdf/qpdf.wasm',
        print: (t) => App._qpdfOut.push(t),
        printErr: (t) => App._qpdfErr.push(t),
      });
    }
    return App._qpdfPromise;
  };

  /* ---------- 工具注册 ---------- */

  App.registerTool = function (def) {
    def.icon = def.icon || '📁';
    App.tools.push(def);
  };

  App.getTool = function (id) {
    return App.tools.find((t) => t.id === id) || null;
  };

  /* ---------- 路由 ---------- */

  App.route = function () {
    const hash = location.hash || '#/';
    const m = hash.match(/^#\/tool\/([a-z0-9-]+)/i);
    if (m && App.getTool(m[1])) {
      App.renderTool(m[1]);
    } else {
      App.renderHome();
    }
  };

  /* ---------- 首页 ---------- */

  App.renderHome = function () {
    App.state = { toolId: null, files: [], results: [], busy: false };
    document.title = '万象转换 OmniConvert — 本地文件格式转换';

    const f = App.filter;
    const tools = App.tools.filter((t) => {
      const okCat = f.cat === 'all' || t.category === f.cat;
      const q = f.q.trim().toLowerCase();
      const okQ = !q || (t.name + t.desc + (t.keywords || '')).toLowerCase().includes(q);
      return okCat && okQ;
    });

    App.$('#view').innerHTML = `
      <section class="hero">
        <div class="hero-badge">🔒 100% 本地处理 · 文件永不上传</div>
        <h1>万象转换</h1>
        <p class="hero-sub">PDF · 图片 · Office 文档格式转换，全部在你的浏览器里完成，离线可用。</p>
      </section>
      <section class="toolbar">
        <input id="search" type="search" placeholder="搜索工具，如：合并、压缩、转 PDF…" value="${f.q.replace(/"/g, '&quot;')}" />
      </section>
      <nav class="chips" id="chips">
        ${App.categories
          .map(
            (c) =>
              `<button class="chip ${f.cat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`
          )
          .join('')}
      </nav>
      <section class="grid" id="tool-grid">
        ${tools.length
          ? tools.map(App.toolCard).join('')
          : '<p class="empty">没有匹配的工具，换个关键词试试。</p>'}
      </section>
      <footer class="foot">
        <p>万象转换 OmniConvert · 参照 BentoPDF / Stirling-PDF 设计 · 转换引擎基于 pdf-lib / pdf.js / SheetJS 等开源库</p>
      </footer>
    `;

    App.$('#search').addEventListener('input', (e) => {
      App.filter.q = e.target.value;
      const grid = App.$('#tool-grid');
      const list = App.tools.filter((t) => {
        const okCat = App.filter.cat === 'all' || t.category === App.filter.cat;
        const q = App.filter.q.trim().toLowerCase();
        return okQ(t, q) && okCat;
      });
      function okQ(t, q) {
        return !q || (t.name + t.desc + (t.keywords || '')).toLowerCase().includes(q);
      }
      grid.innerHTML = list.length ? list.map(App.toolCard).join('') : '<p class="empty">没有匹配的工具，换个关键词试试。</p>';
    });

    App.$$('#chips .chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        App.filter.cat = chip.dataset.cat;
        App.renderHome();
      })
    );
  };

  App.toolCard = function (t) {
    return `
      <a class="card" href="#/tool/${t.id}">
        <div class="card-icon">${t.icon}</div>
        <div class="card-name">${t.name}</div>
        <div class="card-desc">${t.desc}</div>
      </a>
    `;
  };

  /* ---------- 工具页 ---------- */

  App.renderTool = function (id) {
    const tool = App.getTool(id);
    App.state = { toolId: id, files: [], results: [], busy: false };
    document.title = `${tool.name} — 万象转换`;

    const optionsHtml = (tool.options || [])
      .map((o) => {
        const val = o.default;
        if (o.type === 'select') {
          return `
            <label class="opt">
              <span class="opt-label">${o.label}</span>
              <select data-key="${o.key}">
                ${o.choices.map((c) => `<option value="${c.v}" ${c.v === val ? 'selected' : ''}>${c.label}</option>`).join('')}
              </select>
            </label>`;
        }
        if (o.type === 'range') {
          return `
            <label class="opt opt-range">
              <span class="opt-label">${o.label}</span>
              <input type="range" data-key="${o.key}" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${val}" />
              <span class="opt-value" data-value-for="${o.key}">${val}</span>
            </label>`;
        }
        if (o.type === 'number') {
          return `
            <label class="opt">
              <span class="opt-label">${o.label}</span>
              <input type="number" data-key="${o.key}" value="${val}" ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''} />
            </label>`;
        }
        return `
          <label class="opt opt-wide">
            <span class="opt-label">${o.label}</span>
            <input type="text" data-key="${o.key}" value="${String(val).replace(/"/g, '&quot;')}" placeholder="${o.placeholder || ''}" />
          </label>`;
      })
      .join('');

    App.$('#view').innerHTML = `
      <div class="tool-page">
        <a class="back" href="#/">← 返回工具列表</a>
        <header class="tool-head">
          <div class="tool-icon-lg">${tool.icon}</div>
          <div>
            <h2>${tool.name}</h2>
            <p>${tool.desc}</p>
          </div>
        </header>
        <div class="panel">
          <div id="dropzone" class="dropzone">
            <input id="file-input" type="file" ${tool.multiple ? 'multiple' : ''} accept="${tool.accept || ''}" hidden />
            <div class="dz-icon">📤</div>
            <div class="dz-main">${tool.multiple ? '点击选择文件，或拖拽到此处' : '点击选择文件，或拖拽到此处'}</div>
            <div class="dz-hint">支持：${tool.acceptText || tool.accept || '任意文件'} · 处理在本地完成</div>
          </div>
          <ul id="file-list" class="file-list"></ul>
          ${tool.organize ? '<div id="organizer" class="organizer"></div>' : ''}
          ${optionsHtml ? `<div class="options">${optionsHtml}</div>` : ''}
          <button id="run-btn" class="run-btn" disabled>开始转换</button>
          <div id="progress-wrap" class="progress-wrap" hidden>
            <div class="progress-bar"><div id="progress-fill" class="progress-fill"></div></div>
            <div id="status" class="status"></div>
          </div>
          <div id="error-box" class="error-box" hidden></div>
          <div id="results" class="results" hidden>
            <div class="results-head">
              <h3>转换完成 ✅</h3>
              <button id="zip-btn" class="zip-btn" hidden>📦 打包下载 ZIP</button>
            </div>
            <ul id="result-list" class="result-list"></ul>
            <button id="again-btn" class="again-btn">↻ 再转换一批</button>
          </div>
        </div>
        <footer class="foot"><p>万象转换 OmniConvert · 文件不会离开你的设备</p></footer>
      </div>
    `;

    /* 事件绑定 */
    const dz = App.$('#dropzone');
    const input = App.$('#file-input');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('drag');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag');
      App.addFiles(id, Array.from(e.dataTransfer.files));
    });
    input.addEventListener('change', () => {
      App.addFiles(id, Array.from(input.files));
      input.value = '';
    });

    App.$$('.opt-range input').forEach((r) =>
      r.addEventListener('input', () => {
        const v = App.$(`[data-value-for="${r.dataset.key}"]`);
        if (v) v.textContent = r.value;
      })
    );

    App.$('#run-btn').addEventListener('click', () => App.runTool(id));
    App.$('#again-btn').addEventListener('click', () => App.renderTool(id));
    App.$('#zip-btn').addEventListener('click', async () => {
      const entries = App.state.results;
      await App.downloadZip(entries, `${tool.id}-${App.nowStamp()}.zip`);
    });
  };

  App.addFiles = function (id, files) {
    const tool = App.getTool(id);
    if (tool.multiple) {
      App.state.files.push(...files);
    } else {
      App.state.files = files.slice(0, 1);
    }
    App.renderFileList();
    if (tool.organize) App.renderOrganizer();
  };

  App.renderFileList = function () {
    const ul = App.$('#file-list');
    if (!ul) return;
    ul.innerHTML = App.state.files
      .map(
        (f, i) => `
        <li class="file-item">
          <span class="file-name" title="${f.name}">${f.name}</span>
          <span class="file-size">${App.formatSize(f.size)}</span>
          <button class="file-remove" data-i="${i}" title="移除">✕</button>
        </li>`
      )
      .join('');
    App.$$('.file-remove', ul).forEach((btn) =>
      btn.addEventListener('click', () => {
        App.state.files.splice(+btn.dataset.i, 1);
        App.renderFileList();
        if (App.getTool(App.state.toolId) && App.getTool(App.state.toolId).organize) App.renderOrganizer();
      })
    );
    const runBtn = App.$('#run-btn');
    if (runBtn) runBtn.disabled = App.state.files.length === 0 || App.state.busy;
  };

  App.setProgress = function (frac) {
    const fill = App.$('#progress-fill');
    if (fill) fill.style.width = Math.min(100, Math.round(frac * 100)) + '%';
  };

  App.setStatus = function (text) {
    const s = App.$('#status');
    if (s) s.textContent = text || '';
  };

  App.showError = function (msg) {
    const box = App.$('#error-box');
    if (box) {
      box.hidden = false;
      box.textContent = '❌ ' + msg;
    }
  };

  /* ---------- 页面重排（organize 类工具） ---------- */

  App.renderOrganizer = async function () {
    const box = App.$('#organizer');
    if (!box) return;
    const file = App.state.files[0];
    if (!file) {
      App.state.pages = null;
      box.innerHTML = '';
      return;
    }
    box.innerHTML = '<div class="org-status">生成页面缩略图…</div><div class="pages-grid" id="pages-grid"></div>';
    try {
      const buf = await App.readAsArrayBuffer(file);
      const pdf = await App.pdfjs().getDocument({ data: new Uint8Array(buf) }).promise;
      App.state.pages = [];
      App.state._thumbUrls = [];
      const grid = App.$('#pages-grid');
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = 120 / Math.max(vp1.width, vp1.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(vp1.width * scale);
        canvas.height = Math.ceil(vp1.height * scale);
        const ctx2 = canvas.getContext('2d', { alpha: false });
        ctx2.fillStyle = '#fff';
        ctx2.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx2, viewport: page.getViewport({ scale }) }).promise;
        App.state._thumbUrls.push(canvas.toDataURL('image/jpeg', 0.75));
        App.state.pages.push({ src: i - 1, rot: 0 });
        const st = App.$('.org-status');
        if (st) st.textContent = `生成页面缩略图 ${i}/${pdf.numPages}…`;
        await App.nextFrame();
      }
      App.renderPageCards();
    } catch (e) {
      box.innerHTML = `<div class="org-status">缩略图生成失败：${e.message || e}</div>`;
    }
  };

  App.renderPageCards = function () {
    const grid = App.$('#pages-grid');
    if (!grid || !App.state.pages) return;
    grid.innerHTML = App.state.pages
      .map(
        (p, i) => `
        <div class="page-card" draggable="true" data-i="${i}">
          <div class="page-thumb"><img src="${App.state._thumbUrls[p.src]}" class="${p.rot ? 'r' + p.rot : ''}" alt="第${p.src + 1}页" /></div>
          <div class="page-num">原第 ${p.src + 1} 页</div>
          <div class="page-btns">
            <button type="button" data-act="left" title="前移">◀</button>
            <button type="button" data-act="right" title="后移">▶</button>
            <button type="button" data-act="rot" title="旋转 90°">🔄</button>
            <button type="button" data-act="del" title="删除此页">🗑️</button>
          </div>
        </div>`
      )
      .join('');
    let dragFrom = null;
    App.$$('.page-card', grid).forEach((card) => {
      const i = +card.dataset.i;
      card.addEventListener('dragstart', () => {
        dragFrom = i;
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('drop-target');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drop-target');
        if (dragFrom != null && dragFrom !== i) App.movePage(dragFrom, i);
        dragFrom = null;
      });
      App.$$('.page-btns button', card).forEach((btn) =>
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const act = btn.dataset.act;
          if (act === 'left' && i > 0) App.movePage(i, i - 1);
          else if (act === 'right' && i < App.state.pages.length - 1) App.movePage(i, i + 1);
          else if (act === 'rot') App.rotatePage(i);
          else if (act === 'del') App.removePage(i);
        })
      );
    });
    const st = App.$('.org-status');
    if (st)
      st.textContent = `共 ${App.state.pages.length} 页 · 拖拽缩略图调整顺序（手机用 ◀ ▶），🗑️ 删除页面，🔄 旋转页面，然后点“开始转换”`;
  };

  App.movePage = function (from, to) {
    const pages = App.state.pages;
    if (!pages || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return;
    const [p] = pages.splice(from, 1);
    pages.splice(to, 0, p);
    App.renderPageCards();
  };

  App.rotatePage = function (i) {
    const p = App.state.pages[i];
    if (!p) return;
    p.rot = (p.rot + 90) % 360;
    App.renderPageCards();
  };

  App.removePage = function (i) {
    const pages = App.state.pages;
    if (!pages || pages.length <= 1) return;
    pages.splice(i, 1);
    App.renderPageCards();
  };

  App.runTool = async function (id) {
    const tool = App.getTool(id);
    if (App.state.busy || !App.state.files.length) return;

    /* 校验文件数量 */
    const min = tool.minFiles || 1;
    if (App.state.files.length < min) {
      App.showError(`该工具至少需要 ${min} 个文件`);
      return;
    }

    App.state.busy = true;
    App.$('#run-btn').disabled = true;
    App.$('#error-box').hidden = true;
    App.$('#results').hidden = true;
    App.$('#progress-wrap').hidden = false;
    App.setProgress(0);
    App.setStatus('准备中…');

    /* 收集选项 */
    const options = {};
    App.$$('.options [data-key]').forEach((el) => {
      options[el.dataset.key] = el.type === 'range' || el.type === 'number' ? parseFloat(el.value) : el.value;
    });

    const t0 = performance.now();
    try {
      App._keepStatus = false;
      const results = await tool.run(App.state.files.slice(), options, {
        setProgress: App.setProgress,
        setStatus: (text, keep) => {
          App._keepStatus = !!keep;
          App.setStatus(text);
        },
      });
      App.state.results = results;
      App.setProgress(1);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      App.setStatus(App._keepStatus ? `${App.$('#status').textContent} · 用时 ${secs} 秒` : `用时 ${secs} 秒`);
      const list = App.$('#result-list');
      list.innerHTML = results
        .map(
          (r, i) => `
          <li class="result-item">
            <span class="result-icon">📄</span>
            <span class="result-name" title="${r.name}">${r.name}</span>
            <span class="result-size">${App.formatSize(r.blob.size)}</span>
            <button class="result-dl" data-i="${i}">下载</button>
          </li>`
        )
        .join('');
      App.$$('.result-dl', list).forEach((btn) =>
        btn.addEventListener('click', () => {
          const r = App.state.results[+btn.dataset.i];
          App.download(r.name, r.blob);
        })
      );
      App.$('#zip-btn').hidden = results.length < 2;
      App.$('#results').hidden = false;
    } catch (err) {
      console.error(err);
      App.showError(err && err.message ? err.message : String(err));
      App.setStatus('');
    } finally {
      App.state.busy = false;
      App.renderFileList();
    }
  };

  /* ---------- 启动 ---------- */

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => {
    App.route();
    window.addEventListener('hashchange', () => App.route());
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  });
})();
