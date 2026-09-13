/* ============================================================
 * 图片工具组 — 格式转换 / 压缩 / 尺寸调整 / HEIC 转 JPG / ICO 图标
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App;

  /** 解码为位图（HEIC/HEIF 自动处理，逻辑统一在 App.loadImageFile） */
  async function toBitmap(file) {
    return App.loadImageFile(file);
  }

  /** 检测是否含透明像素（缩到 64x64 快速扫描） */
  async function hasAlpha(img) {
    try {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 64, 64);
      const d = ctx.getImageData(0, 0, 64, 64).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  /** 绘制位图到 canvas（可选底色，用于透明图转 JPG） */
  function drawImage(img, w, h, bg) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function baseOf(name) {
    return name.replace(/\.[^.]+$/, '');
  }

  /* ---------- 1. 图片格式转换 ---------- */
  App.registerTool({
    id: 'image-convert',
    icon: '🔁',
    name: '图片格式转换',
    desc: 'JPG / PNG / WebP / HEIC / BMP 互转',
    keywords: 'convert 格式转换 png jpg webp heic bmp 转换',
    category: 'image',
    accept: '.jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif',
    acceptText: 'JPG / PNG / WebP / HEIC / BMP / GIF',
    multiple: true,
    options: [
      {
        key: 'format', label: '目标格式', type: 'select', default: 'png',
        choices: [
          { v: 'png', label: 'PNG（无损，支持透明）' },
          { v: 'jpeg', label: 'JPG（体积小）' },
          { v: 'webp', label: 'WebP（更小）' },
        ],
      },
      { key: 'quality', label: '画质（JPG/WebP）', type: 'range', min: 0.4, max: 1, step: 0.05, default: 0.9 },
    ],
    async run(files, opts, ctx) {
      const mime = 'image/' + opts.format;
      const ext = opts.format === 'jpeg' ? 'jpg' : opts.format;
      const results = [];
      let srcTotal = 0;
      let outTotal = 0;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        ctx.setStatus(`转换 ${f.name}（${i + 1}/${files.length}）…`);
        ctx.setProgress((i + 0.3) / files.length);
        const img = await toBitmap(f);
        const bg = opts.format === 'jpeg' ? '#ffffff' : null;
        const canvas = drawImage(img, img.width, img.height, bg);
        const blob = await App.canvasToBlob(canvas, mime, opts.quality);
        srcTotal += f.size;
        outTotal += blob.size;
        results.push({ name: `${baseOf(f.name)}.${ext}`, blob });
        await App.nextFrame();
      }
      ctx.setStatus(`完成：${App.formatSize(srcTotal)} → ${App.formatSize(outTotal)}`, true);
      return results;
    },
  });

  /* ---------- 2. 图片压缩 ---------- */
  App.registerTool({
    id: 'image-compress',
    icon: '📉',
    name: '图片压缩',
    desc: '在保持画质的前提下减小图片体积',
    keywords: 'compress 压缩 减小 缩小体积',
    category: 'image',
    accept: '.jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif',
    acceptText: 'JPG / PNG / WebP / HEIC / BMP / GIF',
    multiple: true,
    options: [
      {
        key: 'format', label: '输出格式', type: 'select', default: 'auto',
        choices: [
          { v: 'auto', label: '自动（透明→PNG，否则 JPG）' },
          { v: 'jpeg', label: 'JPG' },
          { v: 'webp', label: 'WebP' },
          { v: 'png', label: 'PNG' },
        ],
      },
      { key: 'quality', label: '画质', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.75 },
      { key: 'maxEdge', label: '最长边限制（像素，0=不变）', type: 'number', min: 0, default: 0 },
    ],
    async run(files, opts, ctx) {
      const results = [];
      let srcTotal = 0;
      let outTotal = 0;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        ctx.setStatus(`压缩 ${f.name}（${i + 1}/${files.length}）…`);
        ctx.setProgress((i + 0.3) / files.length);
        const img = await toBitmap(f);

        let fmt = opts.format;
        if (fmt === 'auto') fmt = (await hasAlpha(img)) ? 'png' : 'jpeg';
        const mime = 'image/' + fmt;
        const ext = fmt === 'jpeg' ? 'jpg' : fmt;

        let w = img.width;
        let h = img.height;
        const maxEdge = opts.maxEdge > 0 ? opts.maxEdge : Math.max(w, h);
        if (Math.max(w, h) > maxEdge) {
          const k = maxEdge / Math.max(w, h);
          w *= k;
          h *= k;
        }
        const bg = fmt === 'jpeg' ? '#ffffff' : null;
        const canvas = drawImage(img, w, h, bg);
        const blob = await App.canvasToBlob(canvas, mime, fmt === 'png' ? undefined : opts.quality);
        srcTotal += f.size;
        outTotal += blob.size;
        results.push({ name: `${baseOf(f.name)}-min.${ext}`, blob });
        await App.nextFrame();
      }
      const pct = srcTotal ? Math.round((1 - outTotal / srcTotal) * 100) : 0;
      ctx.setStatus(`完成：${App.formatSize(srcTotal)} → ${App.formatSize(outTotal)}（省 ${pct}%）`, true);
      return results;
    },
  });

  /* ---------- 3. 图片尺寸调整 ---------- */
  App.registerTool({
    id: 'image-resize',
    icon: '📐',
    name: '图片尺寸调整',
    desc: '按百分比或指定像素缩放图片',
    keywords: 'resize 缩放 尺寸 大小 改变',
    category: 'image',
    accept: '.jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif',
    acceptText: 'JPG / PNG / WebP / HEIC / BMP / GIF',
    multiple: true,
    options: [
      {
        key: 'mode', label: '缩放方式', type: 'select', default: 'percent',
        choices: [
          { v: 'percent', label: '按百分比' },
          { v: 'fixed', label: '指定宽 / 高（保持比例）' },
        ],
      },
      { key: 'percent', label: '缩放比例 (%)', type: 'number', min: 1, max: 800, default: 50 },
      { key: 'width', label: '目标宽度 (px，留空自适应)', type: 'number', min: 0, default: 0 },
      { key: 'height', label: '目标高度 (px，留空自适应)', type: 'number', min: 0, default: 0 },
      {
        key: 'format', label: '输出格式', type: 'select', default: 'keep',
        choices: [
          { v: 'keep', label: '保持原格式' },
          { v: 'jpeg', label: 'JPG' },
          { v: 'png', label: 'PNG' },
          { v: 'webp', label: 'WebP' },
        ],
      },
    ],
    async run(files, opts, ctx) {
      const extOf = (n) => (n.match(/\.([a-z0-9]+)$/i) || [,'png'])[1].toLowerCase();
      const results = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        ctx.setStatus(`调整 ${f.name}（${i + 1}/${files.length}）…`);
        ctx.setProgress((i + 0.3) / files.length);
        const img = await toBitmap(f);

        let w;
        let h;
        if (opts.mode === 'percent') {
          const k = (opts.percent || 100) / 100;
          w = img.width * k;
          h = img.height * k;
        } else {
          if (opts.width > 0 && opts.height > 0) {
            w = opts.width;
            h = opts.height;
          } else if (opts.width > 0) {
            w = opts.width;
            h = (img.height * opts.width) / img.width;
          } else if (opts.height > 0) {
            h = opts.height;
            w = (img.width * opts.height) / img.height;
          } else {
            throw new Error('请填写目标宽度或高度');
          }
        }

        let fmt = opts.format;
        if (fmt === 'keep') fmt = ['jpg', 'jpeg'].includes(extOf(f.name)) ? 'jpeg' : extOf(f.name);
        if (!['jpeg', 'png', 'webp'].includes(fmt)) fmt = 'png';
        const mime = 'image/' + fmt;
        const ext = fmt === 'jpeg' ? 'jpg' : fmt;
        const bg = fmt === 'jpeg' ? '#ffffff' : null;
        const canvas = drawImage(img, w, h, bg);
        const blob = await App.canvasToBlob(canvas, mime, 0.9);
        results.push({ name: `${baseOf(f.name)}-${Math.round(w)}x${Math.round(h)}.${ext}`, blob });
        await App.nextFrame();
      }
      return results;
    },
  });

  /* ---------- 4. HEIC 转 JPG（iPhone 照片） ---------- */
  App.registerTool({
    id: 'heic-convert',
    icon: '📱',
    name: 'HEIC 转 JPG',
    desc: '把 iPhone 的 HEIC 照片转为通用 JPG',
    keywords: 'heic heif iphone 苹果 照片 jpg 转换',
    category: 'image',
    accept: '.heic,.heif',
    acceptText: 'HEIC / HEIF 照片',
    multiple: true,
    options: [
      {
        key: 'format', label: '目标格式', type: 'select', default: 'jpeg',
        choices: [
          { v: 'jpeg', label: 'JPG（推荐）' },
          { v: 'png', label: 'PNG' },
        ],
      },
      { key: 'quality', label: 'JPG 画质', type: 'range', min: 0.4, max: 1, step: 0.05, default: 0.9 },
    ],
    async run(files, opts, ctx) {
      const ext = opts.format === 'jpeg' ? 'jpg' : 'png';
      const mime = 'image/' + opts.format;
      const results = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        ctx.setStatus(`解码 ${f.name}（${i + 1}/${files.length}）…`);
        ctx.setProgress((i + 0.2) / files.length);
        const out = await heic2any(f, { toType: mime, quality: opts.quality });
        const blob = Array.isArray(out) ? out[0] : out;
        results.push({ name: `${baseOf(f.name)}.${ext}`, blob });
        await App.nextFrame();
      }
      return results;
    },
  });

  /* ---------- 5. ICO 图标生成 ---------- */
  App.registerTool({
    id: 'image-to-ico',
    icon: '🎯',
    name: 'ICO 图标生成',
    desc: '把图片转成多尺寸 Windows / 网站图标（.ico）',
    keywords: 'ico 图标 favicon 网站图标 生成 windows',
    category: 'image',
    accept: '.png,.jpg,.jpeg,.webp',
    acceptText: 'PNG / JPG / WebP 图片（建议方形）',
    multiple: false,
    options: [
      {
        key: 'preset', label: '尺寸方案', type: 'select', default: 'standard',
        choices: [
          { v: 'standard', label: '标准：16/32/48/64/128/256' },
          { v: 'compact', label: '精简：16/32/48' },
          { v: 'hd', label: '高清：64/128/256' },
        ],
      },
    ],
    async run(files, opts, ctx) {
      const presets = {
        standard: [16, 32, 48, 64, 128, 256],
        compact: [16, 32, 48],
        hd: [64, 128, 256],
      };
      const sizes = presets[opts.preset] || presets.standard;
      const f = files[0];

      ctx.setStatus('解码图片…');
      const img = await toBitmap(f);

      /* 逐尺寸渲染为 PNG（非方形图 contain 居中，透明补边） */
      const pngs = [];
      for (const s of sizes) {
        ctx.setStatus(`生成 ${s}×${s}…`);
        const c = document.createElement('canvas');
        c.width = s;
        c.height = s;
        const cx = c.getContext('2d');
        const k = Math.min(s / img.width, s / img.height);
        const w = Math.max(1, Math.round(img.width * k));
        const h = Math.max(1, Math.round(img.height * k));
        cx.drawImage(img, Math.floor((s - w) / 2), Math.floor((s - h) / 2), w, h);
        const blob = await App.canvasToBlob(c, 'image/png');
        pngs.push(new Uint8Array(await blob.arrayBuffer()));
        await App.nextFrame();
      }

      /* 打包 ICO 容器（ICONDIR + ICONDIRENTRY×N + PNG 数据，小端） */
      ctx.setStatus('打包 ICO…');
      const count = pngs.length;
      const headerSize = 6 + 16 * count;
      const total = headerSize + pngs.reduce((a, b) => a + b.length, 0);
      const buf = new Uint8Array(total);
      const dv = new DataView(buf.buffer);
      dv.setUint16(0, 0, true);       // reserved
      dv.setUint16(2, 1, true);       // type: icon
      dv.setUint16(4, count, true);   // image count
      let offset = headerSize;
      pngs.forEach((png, i) => {
        const e = 6 + 16 * i;
        const s = sizes[i];
        dv.setUint8(e, s >= 256 ? 0 : s);      // width（0 表示 256）
        dv.setUint8(e + 1, s >= 256 ? 0 : s);  // height
        dv.setUint8(e + 2, 0);                 // 调色板数
        dv.setUint8(e + 3, 0);                 // reserved
        dv.setUint16(e + 4, 1, true);          // planes
        dv.setUint16(e + 6, 32, true);         // bpp
        dv.setUint32(e + 8, png.length, true); // 数据长度
        dv.setUint32(e + 12, offset, true);    // 数据偏移
        buf.set(png, offset);
        offset += png.length;
      });

      ctx.setStatus(`已生成 ${count} 个尺寸`, true);
      return [{ name: baseOf(f.name) + '.ico', blob: new Blob([buf], { type: 'image/x-icon' }) }];
    },
  });
})();
