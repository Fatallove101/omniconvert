/* ============================================================
 * OOXML（docx）生成器 — 配合 JSZip 在浏览器端打包 Word 文档
 * 供 PDF→Word 等工具使用；全部为最小化合法 OOXML 结构
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App;

  const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  const CT_XML =
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';

  const ROOT_RELS =
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdDoc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rIdCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rIdApp" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';

  const CORE_XML =
    XML_HEAD +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:creator>OmniConvert</dc:creator><cp:lastModifiedBy>OmniConvert</cp:lastModifiedBy>' +
    '</cp:coreProperties>';

  const APP_XML =
    XML_HEAD +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>OmniConvert</Application>' +
    '</Properties>';

  const DOC_NS =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pageBreak() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  function textPara(t) {
    return `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  }

  /** 内嵌整页图片的段落（EMU = pt × 12700） */
  function imagePara(rid, id, cx, cy) {
    return (
      '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
      `<wp:extent cx="${cx}" cy="${cy}"/>` +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      `<wp:docPr id="${id}" name="Picture ${id}"/>` +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      `<pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/>' +
      `<a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    );
  }

  function sectPr(wpt, hpt, zeroMargin) {
    if (zeroMargin) {
      return (
        `<w:sectPr><w:pgSz w:w="${Math.round(wpt)}" w:h="${Math.round(hpt)}"/>` +
        '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>'
      );
    }
    /* A4 + 常规页边距（twips） */
    return (
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>'
    );
  }

  function docxZip(documentXml, mediaFiles) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', CT_XML);
    zip.file('_rels/.rels', ROOT_RELS);
    zip.file('docProps/core.xml', CORE_XML);
    zip.file('docProps/app.xml', APP_XML);
    zip.file('word/document.xml', documentXml);
    if (mediaFiles && mediaFiles.length) {
      zip.file(
        'word/_rels/document.xml.rels',
        XML_HEAD +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          mediaFiles.map((m) => m.rel).join('') +
          '</Relationships>'
      );
      mediaFiles.forEach((m) => zip.file(`word/media/${m.name}`, m.data, { base64: true }));
    }
    return zip;
  }

  const docBlob = (zip) => zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  /**
   * 图片型 docx：每页一张整页图片（版式 100% 还原）
   * @param {Array<{b64:string, ext:'jpeg'|'png', wpt:number, hpt:number}>} pages
   */
  App.buildImageDocx = async function (pages) {
    if (!pages || !pages.length) throw new Error('没有可写入的页面');
    const media = [];
    let body = '';
    pages.forEach((p, i) => {
      const n = i + 1;
      media.push({
        name: `image${n}.${p.ext}`,
        rel: `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${n}.${p.ext}"/>`,
        data: p.b64,
      });
      body += imagePara(`rId${n}`, n, Math.round(p.wpt * 12700), Math.round(p.hpt * 12700));
      if (i < pages.length - 1) body += pageBreak();
    });
    const first = pages[0];
    const xml =
      XML_HEAD + `<w:document ${DOC_NS}><w:body>` + body + sectPr(first.wpt, first.hpt, true) + '</w:body></w:document>';
    return docBlob(docxZip(xml, media));
  };

  /**
   * 文本型 docx：每页文字转为可编辑段落（不还原版式）
   * @param {Array<string>} pageTexts 每页文本（\n 为换行）
   */
  App.buildTextDocx = async function (pageTexts) {
    if (!pageTexts || !pageTexts.length) throw new Error('没有可写入的内容');
    let body = '';
    pageTexts.forEach((txt, i) => {
      for (const line of String(txt).split('\n')) {
        const t = line.trim();
        if (t) body += textPara(t);
      }
      if (i < pageTexts.length - 1) body += pageBreak();
    });
    if (!body) throw new Error('未能提取到文字：该 PDF 可能是扫描图片，请改用“图片型”模式');
    const xml = XML_HEAD + `<w:document ${DOC_NS}><w:body>` + body + sectPr(0, 0, false) + '</w:body></w:document>';
    return docBlob(docxZip(xml, null));
  };
})();
