/* ============================================================
 * 万象转换 OmniConvert — 核心应用框架
 * 纯浏览器端文件格式转换（零上传、可离线、PWA）
 * ============================================================ */
(function () {
  'use strict';

  const App = {
    VERSION: 'v1.31',
    tools: [],
    state: { toolId: null, files: [], results: [], busy: false },
    categories: [
      { id: 'all', label: '全部', icon: '🗂️' },
      { id: 'pdf', label: 'PDF', icon: '📕' },
      { id: 'image', label: '图片', icon: '🖼️' },
      { id: 'doc', label: '文档', icon: '📄' },
      { id: 'music', label: '歌曲转换（测试中）', icon: '🎵' },
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

  /** Blob → 纯 base64（不含 data: 前缀），用于 OOXML 内嵌图片 */
  App.blobToBase64 = function (blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('读取数据失败'));
      r.readAsDataURL(blob);
    });
  };

  App.canvasToBlob = function (canvas, type, quality) {
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画布导出失败'))), type, quality)
    );
  };

  /** 加载任意图片文件为可绘制位图（HEIC 自动经 heic2any 解码） */
  App.loadImageFile = async function (file) {
    let src = file;
    if (/\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type || '')) {
      if (window.heic2any) {
        const out = await heic2any(file, { toType: 'image/png' });
        src = Array.isArray(out) ? out[0] : out;
      }
    }
    try {
      return await App.loadImage(src);
    } catch (e) {
      throw new Error(`无法解码图片：${file.name}`);
    }
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
    /* 桌面端没有浏览器的下载栏：立刻给"正在保存到 …"，确认落盘后变"已保存" */
    if (App.isTauri() && App._downloadDir) {
      const sep = /[\\/]$/.test(App._downloadDir) ? '' : '\\';
      App.confirmDesktopSave(App._downloadDir + sep + name);
    }
  };

  /* ---------- 桌面端（Tauri）：下载没有浏览器下载栏，必须自己给反馈 ---------- */

  App.isTauri = function () {
    return location.hostname === 'tauri.localhost' || !!window.__TAURI_INTERNALS__;
  };

  App.desktopInvoke = function (cmd, args) {
    const t = window.__TAURI__;
    if (t && t.core && typeof t.core.invoke === 'function') return t.core.invoke(cmd, args);
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
      return window.__TAURI_INTERNALS__.invoke(cmd, args);
    }
    return Promise.reject(new Error('不在桌面端环境中'));
  };

  /** 在工具页显示下载落盘提示。
   *  state: 'saving' 正在保存 / 'ok' 已保存 / 'fail' 未能确认（桌面端没有浏览器下载栏，
   *  必须由页面自己告诉用户文件去哪了） */
  App.showDownloadTip = function (path, state) {
    App._lastDownloadTip = { path: path, state: state }; /* 记住，切页后还能补显示 */
    const box = App.$('#dl-tip');
    if (!box) return;
    box.hidden = false;
    box.textContent = '';
    const prefix = state === 'ok' ? '✅ 已保存：' : state === 'saving' ? '⏳ 正在保存到：' : '⚠️ 未能确认保存，请到该目录查看：';
    const line = document.createElement('div');
    line.className = 'dl-tip-line';
    line.textContent = prefix + (path || '（路径未知）');
    box.appendChild(line);
    if (!path) return;
    const mkBtn = (label, cls, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dl-tip-btn' + (cls ? ' ' + cls : '');
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    };
    box.appendChild(
      mkBtn('打开文件夹', '', () => {
        App.desktopInvoke('oc_open_folder', { path }).catch((e) => App.showError('打开文件夹失败：' + (e.message || e)));
      })
    );
    box.appendChild(
      mkBtn('复制路径', 'ghost', async () => {
        try {
          await navigator.clipboard.writeText(path);
        } catch (e) {
          /* 剪贴板不可用就算了 */
        }
      })
    );
  };

  /** 桌面端：轮询确认文件真的落盘（不依赖上游的下载完成回调，更可靠） */
  App.confirmDesktopSave = function (target) {
    App.showDownloadTip(target, 'saving');
    let last = -1;
    let stable = 0;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      let size = null;
      try {
        size = await App.desktopInvoke('oc_file_size', { path: target });
      } catch (e) {
        size = null;
      }
      if (typeof size === 'number' && size > 0) {
        if (size === last) {
          stable++;
          if (stable >= 2) {
            clearInterval(timer);
            App.showDownloadTip(target, 'ok');
            return;
          }
        } else {
          last = size;
          stable = 0;
        }
      }
      if (tries >= 50) {
        /* 约 20 秒仍未确认：给出可操作提示，而不是一直转圈 */
        clearInterval(timer);
        App.showDownloadTip(target, 'fail');
      }
    }, 400);
  };

  /** 桌面端启动时挂一次：问出保存目录（显示给用户）+ 监听下载完成事件 */
  App.initDesktopDownload = function () {
    if (!App.isTauri()) return;
    App.desktopInvoke('oc_download_dir')
      .then((dir) => {
        App._downloadDir = dir;
        const el = App.$('#dl-dir');
        if (el) {
          el.textContent = `桌面端下载会保存到：${dir}`;
          el.hidden = false;
        }
      })
      .catch(() => {});
    const t = window.__TAURI__;
    if (t && t.event && typeof t.event.listen === 'function') {
      /* 上游若送达下载完成事件就直接用；送不到也没关系 —— confirmDesktopSave 会自行确认 */
      t.event.listen('oc-download-finished', (e) => {
        const p = (e && e.payload) || {};
        if (p.path) App.showDownloadTip(p.path, p.success ? 'ok' : 'fail');
      });
    }
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

  /** unlock-music WASM（歌曲解密引擎）—— 经典脚本 loader-inline.js 已在页面加载，
   *  通过 window.exports 暴露（见 index.html 的 shim），wasm 内联、无外部请求 */
  App.um = function () {
    if (!App._umPromise) {
      App._umPromise = (async () => {
        const um = window.exports;
        if (!um || !um.NCMFile) {
          throw new Error('歌曲引擎脚本未加载，请刷新页面重试');
        }
        await Promise.resolve(um.ready);
        if (um.initPanicHook) um.initPanicHook();
        return um;
      })();
    }
    return App._umPromise;
  };

  /* ---------- 工具注册 ---------- */

  App.registerTool = function (def) {
    def.icon = def.icon || '📁';
    App.tools.push(def);
  };

  App.getTool = function (id) {
    return (
      App.tools.find((t) => t.id === id) ||
      /* 兼容改名前的老链接（如 #/tool/kgg-convert → 密钥格式转换） */
      App.tools.find((t) => (t.legacyIds || []).includes(id)) ||
      null
    );
  };

  /** 重置会话状态：**原地清空**而不是 `App.state = {...}`。
   *  工具脚本都是 `const App = window.App` 取到的全局对象，只有保持 state 引用稳定，
   *  工具侧读到的 pages / files 才和框架写的是同一份（页面重排、图片排序依赖它）。 */
  App.resetState = function (patch) {
    const s = App.state;
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, { toolId: null, files: [], results: [], busy: false }, patch || {});
    return s;
  };

  /* ---------- 最近使用 / 选项记忆（localStorage） ---------- */

  App.getRecent = function () {
    try {
      const arr = JSON.parse(localStorage.getItem('oc-recent') || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  };

  App.recordRecent = function (id) {
    const list = App.getRecent().filter((x) => x !== id);
    list.unshift(id);
    try {
      localStorage.setItem('oc-recent', JSON.stringify(list.slice(0, 8)));
    } catch (e) { /* 忽略 */ }
  };

  App.loadSavedOptions = function (id) {
    try {
      return JSON.parse(localStorage.getItem('oc-opts-' + id) || '{}') || {};
    } catch (e) {
      return {};
    }
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
    App.resetState();
    document.title = '万象转换 OmniConvert — 本地文件格式转换';

    const f = App.filter;
    const tools = App.tools.filter((t) => {
      const okCat = f.cat === 'all' || t.category === f.cat;
      const q = f.q.trim().toLowerCase();
      const okQ = !q || (t.name + t.desc + (t.keywords || '')).toLowerCase().includes(q);
      return okCat && okQ;
    });

    const recentTools = App.getRecent()
      .map((id) => App.getTool(id))
      .filter(Boolean)
      .slice(0, 6);

    App.$('#view').innerHTML = `
      <section class="hero">
        <div class="hero-badge">🔒 100% 本地处理 · 文件永不上传</div>
        <h1>万象转换</h1>
        <p class="hero-sub">PDF · 图片 · 歌曲 · Office 文档格式转换，全部在你的浏览器里完成，离线可用。</p>
      </section>
      <details class="notice">
        <summary>🎵 歌曲格式转换说明（测试中）：哪些能直接解、哪些要密钥、哪些还没实测</summary>
        <ul>
          <li><b>直接能解</b>（密钥在文件里 / 有离线公钥）：网易云 NCM，QQ 音乐老格式 <code>qmc0/qmc3/qmcflac/qmcogg/qmcm</code>，酷狗 <code>KGM/KGMA/VPR</code>（v1/v2/v3）。</li>
          <li><b>需要密钥 → 用「密钥格式转换」</b>：
            <br>· 酷狗 <code>KGG</code> v5：可选密钥库 <span class="kgg-path">%APPDATA%\\KuGou8\\KGMusicV3.db</span> 自动提取，或粘贴该曲 eKey（<b>已用真实文件实测成功</b>）；
            <br>· QQ 音乐新版 <code>mflac/mgg</code>：页脚为 <code>musicex</code> 结构、<b>文件里不含 eKey</b>，需客户端侧导出，或粘贴该曲 eKey；
            <br>· 酷我 <code>kwm/kwms</code> v2：粘贴从客户端取得的该曲 eKey。</li>
          <li><b>尚未实测（缺真实样本，可能不工作）</b>：QQ 音乐 <code>mmp4</code>、酷我 <code>kwm</code> v2 / <code>kwms</code>，以及"手动粘贴 eKey 后解密成功"这两条路径（目前只验证了密钥不对时的报错路径）。网易云 NCM 与 QQ 老 QMC 由解密引擎保证，但本机没有样本可测。</li>
          <li><b>想先摸清自己哪些文件要密钥</b>：运行体检脚本 <code>node test/check-music.mjs "你的音乐目录"</code>，会按 ✅ 可离线 / 🔑 需要密钥 分组列出，并给出该平台的取密钥方法。</li>
          <li>无论哪种格式，处理都在本机浏览器内完成，<b>文件不会上传</b>；拿不到密钥时只会明确报错说明原因，不会输出打不开的文件。</li>
        </ul>
      </details>
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
      ${
        recentTools.length
          ? `<div class="recent"><span class="recent-label">最近使用</span>${recentTools
              .map((t) => `<a class="recent-chip" href="#/tool/${t.id}">${t.icon} ${t.name}</a>`)
              .join('')}</div>`
          : ''
      }
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
    App.resetState({ toolId: id });
    document.title = `${tool.name} — 万象转换`;
    /* 歌曲转换 / KGG 转换类工具：进入前先弹使用须知 */
    if (tool.category === 'music' || tool.category === 'kgg') {
      App.showMusicDisclaimer(null, () => {
        location.hash = '#/';
      });
    }
    const savedOpts = App.loadSavedOptions(id);

    const optionsHtml = (tool.options || [])
      .map((o) => {
        const val = savedOpts[o.key] !== undefined ? savedOpts[o.key] : o.default;
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
            ${tool.outputText ? `<div class="dz-out">可转出：${tool.outputText}</div>` : ''}
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
          <div id="dl-tip" class="dl-tip" hidden></div>
          <div id="dl-dir" class="dl-dir" hidden></div>
          <div id="results" class="results" hidden>
            <div class="results-head">
              <h3>转换完成 ✅</h3>
              <button id="zip-btn" class="zip-btn" hidden>📦 打包下载 ZIP</button>
            </div>
            <ul id="result-list" class="result-list"></ul>
            <button id="again-btn" class="again-btn">↻ 再转换一批</button>
          </div>
          <div id="preview-mask" class="preview-mask" hidden></div>
          <div id="preview-drawer" class="preview-drawer" hidden aria-label="结果预览">
            <div class="preview-head">
              <span id="preview-title" class="preview-title"></span>
              <button id="preview-close" class="preview-close" aria-label="关闭预览">✕</button>
            </div>
            <div id="preview-body" class="preview-body"></div>
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
    App.$('#preview-close').addEventListener('click', App.closePreview);
    App.$('#preview-mask').addEventListener('click', App.closePreview);

    /* 从「歌曲格式转换」点引导按钮跳过来时，把已选文件一并带上，省得用户重新挑文件 */
    if (App._carryFiles && App._carryFiles.length) {
      const carry = App._carryFiles;
      App._carryFiles = null;
      if (id === 'key-decrypt') {
        App.addFiles(id, carry);
        App.setStatus(`已把 ${carry.length} 个文件带过来，点「开始转换」即可`, true);
      }
    }

    /* 桌面端：显示保存目录；若上一批的"已保存"提示还在，补显示出来 */
    if (App.isTauri()) {
      const dirEl = App.$('#dl-dir');
      if (dirEl && App._downloadDir) {
        dirEl.textContent = `桌面端下载会保存到：${App._downloadDir}`;
        dirEl.hidden = false;
      }
      if (App._lastDownloadTip) App.showDownloadTip(App._lastDownloadTip.path, App._lastDownloadTip.state);
    }
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

  App.showError = function (msg, prefix) {
    const box = App.$('#error-box');
    if (box) {
      box.hidden = false;
      box.textContent = (prefix === undefined ? '❌ ' : prefix) + msg;
    }
  };

  /** 报错 + 一个可点的引导按钮（如：「歌曲格式转换」解不开时 → 去「密钥格式转换」）
   *  prefix 传 '🔑 ' 之类可换掉默认的 ❌（"部分成功、部分要密钥"用它更贴切） */
  App.showErrorWithAction = function (msg, actionLabel, onAction, prefix) {
    const box = App.$('#error-box');
    if (!box) return;
    App.showError(msg, prefix);
    if (!actionLabel || !onAction) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'error-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', onAction);
    box.appendChild(document.createElement('br'));
    box.appendChild(btn);
  };

  /** 工具汇报"这些文件需要密钥"：给出跳转「密钥格式转换」的按钮，并把文件带过去。
   *  不论全部失败还是"部分成功、部分要密钥"都会走这里。 */
  App.showNeedKeyGuide = function (files) {
    if (!files || !files.length) return;
    App._carryFiles = files.slice();
    App.showErrorWithAction(
      `有 ${files.length} 个文件需要密钥、无法离线解密：${files.map((f) => f.name).join('、')}。在「密钥格式转换」里按弹窗提示提供密钥库或该曲 eKey 即可`,
      '前往「密钥格式转换」→',
      () => {
        location.hash = '#/tool/key-decrypt';
      },
      '🔑 '
    );
  };

  /* ---------- 页面重排（organize 类工具） ---------- */

  App.renderOrganizer = async function () {
    const box = App.$('#organizer');
    if (!box) return;
    const tool = App.getTool(App.state.toolId);
    const file = App.state.files[0];
    if (!file) {
      App.state.pages = null;
      box.innerHTML = '';
      return;
    }
    if (tool && tool.organize === 'image') {
      return App.renderImageOrganizer(box);
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

  /** 图片排序（图片转 PDF 用）：缩略图直接来自图片文件本身 */
  App.renderImageOrganizer = async function (box) {
    box.innerHTML = '<div class="org-status">生成缩略图…</div><div class="pages-grid" id="pages-grid"></div>';
    const thumbs = [];
    for (let i = 0; i < App.state.files.length; i++) {
      const f = App.state.files[i];
      try {
        const img = await App.loadImageFile(f);
        const k = 120 / Math.max(img.width, img.height);
        const c = App.drawToCanvas(img, img.width * k, img.height * k);
        thumbs.push(c.toDataURL('image/jpeg', 0.75));
      } catch (e) {
        thumbs.push('');
      }
      App.state.pages = App.state.files.map((_, j) => ({ src: j, rot: 0 }));
      const st = App.$('.org-status');
      if (st) st.textContent = `生成缩略图 ${i + 1}/${App.state.files.length}…`;
      await App.nextFrame();
    }
    App.state._thumbUrls = thumbs;
    App.renderPageCards('拖拽缩略图调整图片顺序（手机用 ◀ ▶），🔄 旋转图片，🗑️ 移除图片，然后点“开始转换”');
  };

  App.renderPageCards = function (hint) {
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
      st.textContent =
        hint ||
        `共 ${App.state.pages.length} 页 · 拖拽缩略图调整顺序（手机用 ◀ ▶），🗑️ 删除页面，🔄 旋转页面，然后点“开始转换”`;
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

  /* ---------- 结果预览抽屉 ---------- */

  App.openPreview = async function (r) {
    const mask = App.$('#preview-mask');
    const drawer = App.$('#preview-drawer');
    const body = App.$('#preview-body');
    const title = App.$('#preview-title');
    if (!drawer) return;
    title.textContent = r.name;
    body.innerHTML = '<div class="preview-loading">加载预览…</div>';
    mask.hidden = false;
    drawer.hidden = false;

    if (App._previewUrl) {
      URL.revokeObjectURL(App._previewUrl);
      App._previewUrl = null;
    }

    const t = r.blob.type || '';
    try {
      if (t.startsWith('image/')) {
        App._previewUrl = URL.createObjectURL(r.blob);
        body.innerHTML = `<img class="preview-img" src="${App._previewUrl}" alt="预览" />`;
      } else if (t === 'application/pdf') {
        const buf = await r.blob.arrayBuffer();
        const pdf = await App.pdfjs().getDocument({ data: new Uint8Array(buf) }).promise;
        const page = await pdf.getPage(1);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 720 / vp1.width);
        const vp = page.getViewport({ scale });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width);
        c.height = Math.ceil(vp.height);
        const cx = c.getContext('2d', { alpha: false });
        cx.fillStyle = '#fff';
        cx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: cx, viewport: vp }).promise;
        body.innerHTML =
          `<img class="preview-img" src="${c.toDataURL('image/jpeg', 0.85)}" alt="第1页预览" />` +
          (pdf.numPages > 1 ? `<div class="muted preview-note">共 ${pdf.numPages} 页，此处预览第 1 页</div>` : '');
      } else if (t.startsWith('text/') || t === 'application/json') {
        const text = await r.blob.text();
        const shown = text.length > 20000 ? text.slice(0, 20000) + '\n…（仅显示前 2 万字符）' : text;
        body.innerHTML = '<pre class="preview-text"></pre>';
        body.querySelector('pre').textContent = shown;
      } else {
        body.innerHTML = '<div class="muted preview-note">该文件类型不支持预览，请下载后查看。</div>';
      }
    } catch (e) {
      body.innerHTML = '<div class="muted preview-note">预览失败：' + (e.message || e) + '</div>';
    }
  };

  App.closePreview = function () {
    const drawer = App.$('#preview-drawer');
    const mask = App.$('#preview-mask');
    if (drawer) drawer.hidden = true;
    if (mask) mask.hidden = true;
    if (App._previewUrl) {
      URL.revokeObjectURL(App._previewUrl);
      App._previewUrl = null;
    }
    const body = App.$('#preview-body');
    if (body) body.innerHTML = '';
  };

  /** 歌曲转换免责声明弹窗（每次进入该栏目/工具时展示） */
  App.showMusicDisclaimer = function (onOk, onCancel) {
    const old = App.$('#disclaimer-mask');
    if (old) old.remove();
    const mask = document.createElement('div');
    mask.id = 'disclaimer-mask';
    mask.className = 'disclaimer-mask';
      mask.innerHTML = `
        <div class="disclaimer-card">
          <div class="disclaimer-icon">🎵</div>
          <h3>使用须知</h3>
          <p>歌曲格式转换 / 密钥格式转换功能仅用于<b>个人学习与研究</b>，请支持正版音乐。</p>
          <p>请确保仅对您拥有合法权利的音频文件进行操作；请勿用于批量分发、倒卖、牟利或规避付费授权；使用本功能产生的一切后果由使用者自行承担。完整合规说明见 README「合规与风险边界」。</p>
        <div class="disclaimer-btns">
          <button type="button" class="disclaimer-cancel">取消</button>
          <button type="button" class="disclaimer-ok">我已阅读并继续</button>
        </div>
      </div>`;
    document.body.appendChild(mask);
    mask.querySelector('.disclaimer-ok').addEventListener('click', () => {
      mask.remove();
      if (onOk) onOk();
    });
    mask.querySelector('.disclaimer-cancel').addEventListener('click', () => {
      mask.remove();
      if (onCancel) onCancel();
    });
  };

  /** 各平台的「怎么找到密钥」引导文案（弹窗结构统一：方式一（推荐）→ 方式二 手动粘贴）
   *  酷狗 kgg：KGMusicV3.db 可自动提取；QQ qmc：新版页脚无 eKey，需客户端侧导出或该曲 eKey；
   *  酷我 kwm：v2/kwms 需客户端取得的 eKey。 */
  App.KEY_DIALOGS = {
    kgg: {
      title: '需要该歌曲的 eKey 密钥',
      lead: '该文件为酷狗 KGG / KGM 加密，每首歌的密钥不同。',
      way1:
        '<b>方式一（推荐）：</b>选择密钥库文件自动提取。密钥库在登录过酷狗 PC 客户端并下载过这首歌的电脑上：<br>' +
        '<span class="kgg-path">C:\\Users\\&lt;用户名&gt;\\AppData\\Roaming\\KuGou8\\KGMusicV3.db</span>',
      db: true,
      way2: '<b>方式二：</b>手动粘贴该歌曲的 eKey / EncryptionKey：',
      idLabel: '本文件音频标识（audio_hash）',
    },
    qmc: {
      title: '需要该歌曲的 eKey（QQ 音乐）',
      lead:
        '该文件是<b>新版 QQ 音乐加密</b>（页脚为 <b>musicex</b> 结构，<b>文件里不含 eKey</b>）：每首歌的 eKey 只存在于 QQ 音乐客户端运行期；' +
        '本页面是纯浏览器程序，无法挂到客户端进程上取密钥，所以没有 eKey 就无法离线解密。',
      way1:
        '<b>方式一（推荐）：</b>改用客户端侧导出 —— QQ 音乐客户端自带的转换 / 导出（若你的客户端版本提供），' +
        '或使用支持「运行期解密（需 QQ 音乐保持运行）」的桌面工具；导出的 MP3 / FLAC / OGG 可直接播放，不必经过本页面。',
      db: false,
      way2: '<b>方式二：</b>若你已取得这一首的 eKey（一长串 base64），粘贴到这里，本页面就能离线完成解密：',
      idLabel: '文件内记录的名称（mediaName）',
    },
    kwm: {
      title: '需要该歌曲的 eKey（酷我音乐）',
      lead: '该文件为酷我 KWM 加密：v1 已尝试离线解密但未识别，属于 v2 / kwms 变体，每首歌的密钥不同。',
      way1: '<b>方式一（推荐）：</b>改用酷我客户端侧的导出能力（客户端内下载后导出通用格式），或用支持运行期解密的桌面工具。',
      db: false,
      way2: '<b>方式二：</b>粘贴从客户端取得的该曲 eKey（一长串 base64），本工具会用酷我 v2 密钥通道尝试解密（解不出会明确报错）：',
      idLabel: '文件名',
    },
  };

  /** 音乐解密密钥弹窗：kind = 'kgg'（酷狗）/ 'qmc'（QQ 音乐）/ 'kwm'（酷我）。
   *  返回 Promise<string|null>（取消返回 null） */
  App.askMusicEkey = function (kind, audioHash) {
    const conf = App.KEY_DIALOGS[kind] || App.KEY_DIALOGS.kgg;
    const isKgg = kind === 'kgg';
    return new Promise((resolve) => {
      const old = App.$('#kgg-key-mask');
      if (old) old.remove();
      const mask = document.createElement('div');
      mask.id = 'kgg-key-mask';
      mask.className = 'disclaimer-mask';
      mask.innerHTML = `
        <div class="disclaimer-card">
          <div class="disclaimer-icon">🔑</div>
          <h3>${conf.title}</h3>
          <p>${conf.lead}</p>
          <p>${conf.way1}</p>
          ${conf.db ? '<input type="file" id="kgg-db-input" accept=".db" />\n          <div id="kgg-db-status" class="muted"></div>' : ''}
          <p>${conf.way2}</p>
          <input type="text" id="kgg-ekey-input" class="kgg-input" placeholder="粘贴 eKey / EncryptionKey" autocomplete="off" spellcheck="false" />
          ${audioHash ? `<p class="muted">${conf.idLabel}：${audioHash}</p>` : ''}
          <p class="muted">仅限转换你自己账号下载的歌曲，请支持正版。</p>
          <div class="disclaimer-btns">
            <button type="button" class="disclaimer-cancel">取消</button>
            <button type="button" class="disclaimer-ok">开始转换</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
      const input = mask.querySelector('#kgg-ekey-input');
      const dbInput = mask.querySelector('#kgg-db-input');
      const dbStatus = mask.querySelector('#kgg-db-status');
      const close = (v) => {
        mask.remove();
        resolve(v);
      };
      const submit = () => {
        const v = input.value.trim();
        if (!v) {
          input.classList.add('kgg-input-err');
          input.placeholder = '密钥不能为空';
          return;
        }
        close(v);
      };
      mask.querySelector('.disclaimer-ok').addEventListener('click', submit);
      mask.querySelector('.disclaimer-cancel').addEventListener('click', () => close(null));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
      /* 密钥库自动提取仅酷狗 KGG v5 适用（QQ 音乐没有这类本地明文密钥库） */
      if (isKgg && dbInput) dbInput.addEventListener('change', async () => {
        const f = dbInput.files && dbInput.files[0];
        if (!f) return;
        dbStatus.textContent = '检查解密模块…';
        try {
          /* 自愈：任何缺失的模块现场从服务器重新拉取执行（对抗旧缓存/加载失败） */
          const diag = [];
          for (const [file, probe] of [
            ['/js/md5.js', () => App.md5],
            ['/js/aes.js', () => App.aesCbcDecryptNoPad],
            ['/js/kgg-db.js', () => App.decryptKggDb],
          ]) {
            if (typeof probe() !== 'function') {
              try {
                const res = await fetch(file);
                diag.push(file + '=' + res.status);
                if (!res.ok) throw new Error('获取 ' + file + ' 失败: ' + res.status);
                const src = await res.text();
                new Function(src)();
                diag.push('eval=' + typeof probe());
              } catch (e) {
                diag.push(file + ' 错误: ' + (e.message || e));
              }
            }
          }
          if (typeof App.decryptKggDb !== 'function') {
            throw new Error('模块自愈失败 [' + diag.join('; ') + ']，请 Ctrl+F5 强制刷新后重试');
          }
          dbStatus.textContent = '解密密钥库…';
          const bytes = new Uint8Array(await f.arrayBuffer());
          const dec = App.decryptKggDb(bytes);
          let map = null;
          let total = 0;
          try {
            map = await App.extractKggKeyMapping(dec);
            total = Object.keys(map).length;
          } catch (sqlErr) {
            map = null;
          }
          let ek = audioHash && map && map[audioHash];
          if (!ek) {
            /* sql.js 提取失败/未命中时，直接在解密后的库里扫描密钥串（去掉 SQLite 引擎依赖） */
            dbStatus.textContent = 'SQL 提取未命中，尝试直接扫描…';
            ek = App.scanEkeyNear(dec, audioHash);
          }
          if (ek) {
            input.value = ek;
            dbStatus.textContent = `已找到当前歌曲的密钥 ✓ ${total ? '密钥库共 ' + total + ' 条，' : '（扫描命中）'}正在转换…`;
            setTimeout(() => close(ek), 300);
          } else {
            dbStatus.textContent = `密钥库共 ${total} 条，但没有当前这首歌的密钥（请确认是在该客户端内下载的这首歌）`;
          }
        } catch (e) {
          dbStatus.textContent = '密钥库读取失败：' + (e.message || e) + '（页面版本 ' + (App.VERSION || '旧版-请强制刷新') + '）';
        }
      });
      setTimeout(() => input.focus(), 50);
    });
  };

  /** 旧调用名（酷狗 KGG v5 路径）保留兼容 */
  App.askKggEkey = function (audioHash) {
    return App.askMusicEkey('kgg', audioHash);
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
        /* 工具（歌曲类）汇报"这些文件需要密钥" → 给出跳转引导按钮 */
        notifyNeedKey: App.showNeedKeyGuide,
      });
      App.state.results = results;
      try {
        localStorage.setItem('oc-opts-' + id, JSON.stringify(options));
      } catch (e) { /* 忽略 */ }
      App.recordRecent(id);
      App.setProgress(1);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      App.setStatus(App._keepStatus ? `${App.$('#status').textContent} · 用时 ${secs} 秒` : `用时 ${secs} 秒`);
      const list = App.$('#result-list');
      if (tool.noFile) {
        /* 无文件输出类工具（如调起打印），只展示状态 */
        list.innerHTML = '';
      } else {
        list.innerHTML = results
        .map((r, i) => {
          const t = r.blob.type || '';
          const copyable = t.startsWith('text/') || t === 'application/json';
          return `
          <li class="result-item">
            <span class="result-icon">📄</span>
            <span class="result-name" title="${r.name}">${r.name}</span>
            <span class="result-size">${App.formatSize(r.blob.size)}</span>
            <button class="result-dl ghost" data-act="preview" data-i="${i}">预览</button>
            ${copyable ? '<button class="result-dl ghost" data-act="copy" data-i="' + i + '">复制</button>' : ''}
            <button class="result-dl" data-act="download" data-i="${i}">下载</button>
          </li>`;
        })
        .join('');
        list.onclick = async (e) => {
          const btn = e.target.closest('button[data-act]');
          if (!btn) return;
          const r = App.state.results[+btn.dataset.i];
          if (!r) return;
          if (btn.dataset.act === 'download') {
            App.download(r.name, r.blob);
          } else if (btn.dataset.act === 'preview') {
            App.openPreview(r);
          } else if (btn.dataset.act === 'copy') {
            try {
              await navigator.clipboard.writeText(await r.blob.text());
              btn.textContent = '已复制';
              setTimeout(() => (btn.textContent = '复制'), 1500);
            } catch (err) {
              App.showError('复制失败：' + (err.message || err));
            }
          }
        };
      }
      App.$('#zip-btn').hidden = tool.noFile || results.length < 2;
      App.$('#results').hidden = !!tool.noFile;
    } catch (err) {
      console.error(err);
      if (err && err.needsKeyTool) {
        /* 需要密钥才能解：引导到「密钥格式转换」，并把已选文件一起带过去 */
        App.showErrorWithAction(err.message, '前往「密钥格式转换」→', () => {
          App._carryFiles = App.state.files.slice();
          location.hash = '#/tool/key-decrypt';
        });
      } else {
        App.showError(err && err.message ? err.message : String(err));
      }
      App.setStatus('');
    } finally {
      App.state.busy = false;
      App.renderFileList();
    }
  };

  /* ---------- 启动 ---------- */

  /* 合并式挂载：window.App 必须与内部 App 是**同一个对象**。
   * 工具脚本（js/tools/*.js）一律 `const App = window.App`，若这里交出浅拷贝，
   * 框架后续对 App 的写入（state 重建等）就传不到工具侧 —— 会出现「PDF 页面重排
   * 报错」「图片转 PDF 丢失排序/旋转」这类状态失联问题。
   * 先把（可能存在的）旧 window.App 成员并进来，再把 App 本身暴露出去。 */
  window.App = Object.assign(App, window.App || {});
  document.addEventListener('DOMContentLoaded', () => {
    App.route();
    window.addEventListener('hashchange', () => App.route());

    /* 深浅色切换（记忆选择，默认跟随系统） */
    const tg = document.getElementById('theme-toggle');
    if (tg) {
      const applyIcon = () => {
        tg.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
      };
      applyIcon();
      tg.addEventListener('click', () => {
        const dark = document.documentElement.classList.toggle('dark');
        try {
          localStorage.setItem('oc-theme', dark ? 'dark' : 'light');
        } catch (e) { /* 忽略 */ }
        applyIcon();
      });
    }

    /* 桌面端（Tauri）：下载没有浏览器下载栏，启动时问出保存目录并监听下载完成事件 */
    App.initDesktopDownload();

    /* Service Worker：仅在浏览器环境注册。
     * 桌面端（Tauri 的 tauri.localhost）绝对不能开 —— SW 的网络 fetch 会被
     * 系统 DNS 污染/劫持，导致页面导航失败白屏；桌面资源本身已内嵌，无需 SW。 */
    if ('serviceWorker' in navigator) {
      const isTauri = App.isTauri();
      if (isTauri) {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
        if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
      } else if (/^https?:$/.test(location.protocol)) {
        /* 有新版本发布时自动刷新一次页面（旧 SW 会被 skipWaiting 接管） */
        let hadController = !!navigator.serviceWorker.controller;
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (hadController && !refreshing) {
            refreshing = true;
            location.reload();
          }
        });
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }
    }
  });
})();
