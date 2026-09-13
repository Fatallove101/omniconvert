/* ============================================================
 * 文档工具组 — Excel↔CSV / Word 转 HTML / Markdown 转 HTML
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App;

  const DOC_CSS = `
    body{max-width:860px;margin:40px auto;padding:0 20px;font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;line-height:1.7;color:#222}
    h1,h2,h3{line-height:1.3} code{background:#f2f3f5;padding:2px 6px;border-radius:4px}
    pre{background:#f2f3f5;padding:14px;border-radius:8px;overflow:auto} pre code{padding:0;background:none}
    table{border-collapse:collapse} td,th{border:1px solid #ddd;padding:6px 10px}
    img{max-width:100%} blockquote{border-left:4px solid #ddd;margin:0;padding-left:14px;color:#666}
  `;

  function wrapHtml(title, body) {
    return (
      `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n` +
      `<style>${DOC_CSS}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`
    );
  }

  const htmlBlob = (s) => new Blob([s], { type: 'text/html;charset=utf-8' });
  const baseOf = (n) => n.replace(/\.[^.]+$/, '');

  /* ---------- 1. Excel ↔ CSV ---------- */
  App.registerTool({
    id: 'xlsx-csv',
    icon: '📊',
    name: 'Excel ↔ CSV',
    desc: 'xlsx/xls 转 CSV，或 CSV 转 xlsx（自动识别方向）',
    keywords: 'excel csv xlsx 表格 转换',
    category: 'doc',
    accept: '.xlsx,.xls,.csv',
    acceptText: 'xlsx / xls / csv 表格',
    multiple: false,
    async run(files, opts, ctx) {
      const f = files[0];
      if (/\.csv$/i.test(f.name)) {
        /* CSV → XLSX */
        ctx.setStatus('解析 CSV…');
        const text = await App.readAsText(f);
        const wb = XLSX.read(text, { type: 'string', raw: false });
        ctx.setStatus('生成 xlsx…');
        const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const name = baseOf(f.name) + '.xlsx';
        return [{ name, blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) }];
      }

      /* XLSX/XLS → CSV（每个工作表一个文件） */
      ctx.setStatus('解析 Excel…');
      const buf = await App.readAsArrayBuffer(f);
      const wb = XLSX.read(buf, { type: 'array' });
      const results = [];
      for (let i = 0; i < wb.SheetNames.length; i++) {
        const sheet = wb.SheetNames[i];
        ctx.setStatus(`转换工作表：${sheet}（${i + 1}/${wb.SheetNames.length}）…`);
        ctx.setProgress((i + 0.5) / wb.SheetNames.length);
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheet]);
        const suffix = wb.SheetNames.length > 1 ? `-${sheet}` : '';
        results.push({
          name: `${baseOf(f.name)}${suffix}.csv`,
          blob: new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }),
        });
        await App.nextFrame();
      }
      return results;
    },
  });

  /* ---------- 2. Word 转 HTML / 文本 ---------- */
  App.registerTool({
    id: 'docx-html',
    icon: '📘',
    name: 'Word 转 HTML',
    desc: 'docx 转为网页 HTML 或纯文本',
    keywords: 'word docx html 文本 提取 转换',
    category: 'doc',
    accept: '.docx',
    acceptText: 'docx 文档（暂不支持 .doc）',
    multiple: false,
    options: [
      {
        key: 'out', label: '输出格式', type: 'select', default: 'html',
        choices: [
          { v: 'html', label: 'HTML 网页（保留排版）' },
          { v: 'text', label: '纯文本 TXT' },
        ],
      },
    ],
    async run(files, opts, ctx) {
      const f = files[0];
      ctx.setStatus('解析 Word 文档…');
      const buf = await App.readAsArrayBuffer(f);
      const base = baseOf(f.name);

      if (opts.out === 'text') {
        const r = await mammoth.extractRawText({ arrayBuffer: buf });
        const name = base + '.txt';
        return [{ name, blob: new Blob(['\ufeff' + r.value], { type: 'text/plain;charset=utf-8' }) }];
      }

      const r = await mammoth.convertToHtml({ arrayBuffer: buf });
      const name = base + '.html';
      return [{ name, blob: htmlBlob(wrapHtml(base, r.value)) }];
    },
  });

  /* ---------- 3. Markdown 转 HTML ---------- */
  App.registerTool({
    id: 'md-html',
    icon: 'Ⓜ️',
    name: 'Markdown 转 HTML',
    desc: 'md 文件转为可直接打开的网页',
    keywords: 'markdown md html 转换',
    category: 'doc',
    accept: '.md,.markdown,.txt',
    acceptText: 'markdown / md 文件',
    multiple: false,
    options: [
      {
        key: 'out', label: '输出形式', type: 'select', default: 'standalone',
        choices: [
          { v: 'standalone', label: '完整网页（含样式）' },
          { v: 'fragment', label: 'HTML 片段（嵌入用）' },
        ],
      },
    ],
    async run(files, opts, ctx) {
      const f = files[0];
      ctx.setStatus('解析 Markdown…');
      const md = await App.readAsText(f);
      const body = marked.parse(md);
      const base = baseOf(f.name);
      const name = base + '.html';
      return [{ name, blob: htmlBlob(opts.out === 'fragment' ? body : wrapHtml(base, body)) }];
    },
  });

  /* ---------- 4. Word 转 PDF（打印版） ---------- */
  App.registerTool({
    id: 'docx-to-pdf',
    icon: '🖨️',
    name: 'Word 转 PDF',
    desc: 'docx 排版后调起打印，在打印对话框选“另存为 PDF”',
    keywords: 'word docx pdf 打印 转换 导出',
    category: 'doc',
    accept: '.docx',
    acceptText: 'docx 文档（暂不支持 .doc）',
    multiple: false,
    noFile: true,
    async run(files, opts, ctx) {
      const f = files[0];
      ctx.setStatus('解析 Word 文档…');
      const buf = await App.readAsArrayBuffer(f);
      const r = await mammoth.convertToHtml({ arrayBuffer: buf });
      const styled = wrapHtml(baseOf(f.name), r.value).replace(
        '</style>',
        '@page{margin:18mm} @media print{body{max-width:none;margin:0;padding:0}} img{max-width:100%}</style>'
      );

      /* 隐藏 iframe 内排版并调起系统打印 → 用户选择“另存为 PDF” */
      ctx.setStatus('请在新弹出的打印对话框中选择“另存为 PDF”', true);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0.01';
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument;
      idoc.open();
      idoc.write(styled);
      idoc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {
          App.showError('打印调起失败：' + (e.message || e));
        }
      }, 700);
      setTimeout(() => iframe.remove(), 5 * 60 * 1000);
      return [];
    },
  });
})();
