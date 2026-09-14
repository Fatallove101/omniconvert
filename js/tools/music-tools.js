/* ============================================================
 * 歌曲转换工具组
 * - 歌曲格式转换：NCM(网易云) / QMC·MFLAC·MGG(QQ音乐) / KWM(酷我)
 * - KGG 格式转换：KGG / KGMA / KGM / VPR(酷狗)
 * 引擎：unlock-music WASM（@clamber_l/crypto，MIT/Apache-2.0）
 *      + 内置 KGG v3 解码器（移植自 TriAgent，GPL-3.0）
 * 说明：只做"解密还原"（去掉加密壳，得到原本的音频文件），
 *       不做有损转码（如 flac→mp3 需要音频编码器，本项目不内置）。
 * ============================================================ */
(function () {
  'use strict';
  const App = window.App;

  const MIME = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    oggs: 'audio/ogg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ape: 'audio/ape',
    wma: 'audio/x-ms-wma',
    tkm: 'audio/mpeg',
  };

  /* 解密后嗅探不出类型时的兜底扩展名 */
  const FALLBACK_EXT = {
    ncm: 'mp3',
    qmc0: 'mp3',
    qmc3: 'mp3',
    qmcflac: 'flac',
    qmcogg: 'ogg',
    qmcm: 'mp3',
    mflac: 'flac',
    mgg: 'ogg',
    mgg1: 'ogg',
    kgm: 'mp3',
    kgma: 'flac',
    kgg: 'flac',
    vpr: 'flac',
    kwm: 'mp3',
  };

  /* 这些来源的格式嗅探失败时，允许按扩展名兜底（仅限算法完全确定的老格式：
   * NCM 与 QMC1 静态映射）。QMC2 系列（mflac/mgg/mgg1）绝不能兜底 ——
   * 一旦解密路径不对，兜底会把垃圾字节按 .flac/.ogg 交出去，用户拿到的是打不开的文件。 */
  const TRUST_FALLBACK = {
    ncm: 1,
    qmc0: 1,
    qmc3: 1,
    qmcflac: 1,
    qmcogg: 1,
    qmcm: 1,
  };

  /* QMC1 静态映射格式：无页脚密钥，整文件原位解密 */
  const QMC1_EXTS = ['qmc0', 'qmc3', 'qmcflac', 'qmcogg', 'qmcm'];
  /* QMC2 格式：密钥要么在页脚里（老变体明文），要么需要用户手动提供（musicex 新变体） */
  const QMC2_EXTS = ['mflac', 'mgg', 'mgg1'];

  /* 两个工具各自接受的扩展名：老酷狗加密(kgm/kgma/vpr)归歌曲转换，仅 .kgg 独立 */
  const MUSIC_EXTS = ['ncm', 'qmc0', 'qmc3', 'qmcflac', 'qmcogg', 'qmcm', 'mflac', 'mgg', 'mgg1', 'kwm', 'kgm', 'kgma', 'vpr'];
  const KGG_EXTS = ['kgg'];

  function extOf(name) {
    const m = name.match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
  }

  function baseOf(name) {
    return name.replace(/\.[^.]+$/, '');
  }

  /** 解密后嗅探音频真实类型 */
  function detectExt(um, bytes) {
    try {
      const r = um.detectAudioType(bytes.slice(0, 1024));
      if (r && r.audioType && r.audioType !== 'bin') return r.audioType;
    } catch (e) { /* 忽略 */ }
    return null;
  }

  /** NCM（网易云音乐） */
  function decNCM(um, buf, name) {
    const f = new um.NCMFile();
    let need = 4096;
    let r = f.open(buf.subarray(0, Math.min(buf.length, need)));
    while (r > 0 && need < buf.length) {
      need = Math.min(buf.length, Math.max(r, need * 2));
      r = f.open(buf.subarray(0, need));
    }
    if (r !== 0) throw new Error('不是有效的 NCM 文件');
    const off = f.audioOffset;
    if (!(off > 0 && off < buf.length)) throw new Error('NCM 结构异常');
    const audio = buf.slice(off);
    f.decrypt(audio, 0);
    return audio;
  }

  /** KGM / KGMA / VPR / KGG（酷狗）：按头部版本分流
   *  v1/v2 → unlock-music WASM；v3 → 内置 KGG v3 解码器（离线公钥）；
   *  v5 → 需要该歌曲的 eKey（弹窗让用户输入或选密钥库） */
  async function decKGM(um, buf, name) {
    if (buf.length < 0x40) throw new Error('文件太小，不是有效的酷狗加密文件');
    const h = App.KGG.parseHeader(buf.subarray(0, 0x400));

    if (h.version >= 5) {
      /* v5：需要该歌曲的 eKey。抛出特殊错误，由 run() 弹出输入窗口走手动密钥流程 */
      const err = new Error('该文件为 KGG v5 加密，需要该歌曲的 eKey 密钥');
      err.needEkey = { kind: 'kgg', hash: h.audioHash, bodyStart: h.audioOffset, bodyEnd: buf.length, buf, name };
      throw err;
    }
    if (h.version >= 3) {
      const pubKey = await App.KGG.loadPubKey();
      const own = new Uint8Array(App.KGG.OWN_LEN);
      own.set(h.testData);
      const body = buf.slice(h.audioOffset);
      App.KGG.decodeV3(body, own, pubKey, 0);
      return body;
    }

    /* v1/v2 老格式（密钥内嵌于头部） */
    const kg = um.KuGou.from_header(buf.subarray(0, Math.min(buf.length, 0x400)));
    const body = buf.slice(h.audioOffset);
    /* 实测：decrypt 的 offset 参数须为相对 body 的偏移（传绝对偏移会整段错位） */
    kg.decrypt(body, 0);
    return body;
  }

  /** QMC 系列（QQ音乐）：老静态映射(qmc0/3/flac/ogg) 与 内嵌 eKey 的 QMC2(mflac/mgg)
   *  注意：新版 QQ 音乐 mgg/mflac 的页脚是 musicex 结构，**不含明文 eKey**
   *  （QMCFooter.parse 能解析出 mediaName 与 size，但 ekey === undefined）。
   *  这种文件只能拿到该曲 eKey 后手动解密，绝不能回落到 QMC1 静态映射 ——
   *  那会解出垃圾字节，却仍按扩展名输出成"看起来成功"的文件。 */
  function decQMC(um, buf, name) {
    const extIn = extOf(name);
    let footer = null;
    const tailN = Math.min(buf.length, 1024);
    try {
      footer = um.QMCFooter.parse(buf.subarray(buf.length - tailN));
    } catch (e) {
      footer = null;
    }
    const ekey = footer && footer.ekey;
    if (ekey) {
      const fsize = footer.size || 0;
      const bodyLen = Math.max(0, buf.length - fsize);
      if (bodyLen <= 0) throw new Error('文件内容为空');
      const body = buf.slice(0, bodyLen);
      const cipher = new um.QMC2(ekey);
      cipher.decrypt(body, 0);
      return body;
    }

    if (QMC2_EXTS.includes(extIn)) {
      /* 页脚无明文 eKey：把范围信息交给 run()，由弹窗让用户提供 eKey 后再解 */
      const err = new Error(
        footer
          ? '该文件为新版 QQ 音乐加密（页脚 musicex 结构，不含明文 eKey），纯离线无法解密'
          : '未能从文件页脚解析出 eKey（文件可能不完整，或属于未知变体）'
      );
      err.needEkey = {
        kind: 'qmc',
        hash: (footer && footer.mediaName) || '',
        bodyStart: 0,
        bodyEnd: Math.max(0, buf.length - ((footer && footer.size) || 0)),
        buf,
        name,
      };
      throw err;
    }

    /* v1 静态映射：整文件原位解密（无尾部密钥） */
    if (!QMC1_EXTS.includes(extIn)) throw new Error('未知的 QMC 变体：.' + extIn);
    const body = buf.slice(0);
    um.decryptQMC1(body, 0);
    return body;
  }

  /** KWM v1（酷我）；v2 需要单独提取的密钥，暂不支持 */
  function decKWM(um, buf, name) {
    const headerN = Math.min(buf.length, 0x400);
    const d = new um.KWMDecipherV1(buf.subarray(0, headerN));
    const off = 0x400;
    if (buf.length <= off) throw new Error('KWM 文件太小');
    const body = buf.slice(off);
    d.decrypt(body, 0);
    return body;
  }

  const ROUTE = {
    ncm: decNCM,
    kgm: decKGM,
    kgma: decKGM,
    vpr: decKGM,
    kgg: decKGM,
    qmc0: decQMC,
    qmc3: decQMC,
    qmcflac: decQMC,
    qmcogg: decQMC,
    qmcm: decQMC,
    mflac: decQMC,
    mgg: decQMC,
    mgg1: decQMC,
    kwm: decKWM,
  };

  /** 公共批量解密循环：allowedExts 限定该工具处理的扩展名 */
  async function runDecrypt(files, ctx, allowedExts) {
    let um;
    try {
      um = await App.um();
    } catch (e) {
      throw new Error('转换引擎加载失败：' + (e.message || e));
    }

    const results = [];
    const failures = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const extIn = extOf(f.name);
      ctx.setStatus(`转换 ${f.name}（${i + 1}/${files.length}）…`);
      ctx.setProgress((i + 0.25) / files.length);
      try {
        const fn = ROUTE[extIn];
        if (!fn) throw new Error('暂不支持该扩展名');
        if (!allowedExts.includes(extIn)) {
          throw new Error('该格式请在「' + (allowedExts.includes('ncm') ? '歌曲格式转换' : 'KGG 格式转换') + '」工具中处理');
        }
        const buf = new Uint8Array(await App.readAsArrayBuffer(f));
        const out = await fn(um, buf, f.name);
        if (!out || !out.length) throw new Error('转换结果为空');
        const det = detectExt(um, out);
        let ext = det || FALLBACK_EXT[extIn] || null;
        /* 输出自检：识别不出音频类型的，明确报错而不是输出损坏文件 */
        if (!ext || (!det && !TRUST_FALLBACK[extIn])) {
          throw new Error('转换后无法识别音频格式——该加密变体可能不支持离线转换（如酷狗新版 KGMA v3+、QQ 音乐新版 mgg/mflac，都需要每首歌各自的密钥）');
        }
        results.push({
          name: `${baseOf(f.name)}.${ext}`,
          blob: new Blob([out], { type: MIME[ext] || 'application/octet-stream' }),
        });
      } catch (e) {
        if (e && e.needEkey) {
          /* 需要每首歌的 eKey：KGG v5（酷狗）或 QMC2 新版 mgg/mflac（QQ 音乐）
           * → 弹出对应引导的输入窗口，用户提供密钥后按 QMC2 解密指定区间 */
          const ne = e.needEkey;
          const ekey = await App.askMusicEkey(ne.kind, ne.hash);
          if (!ekey) {
            /* 把底层原因（musicex 变体 / 页脚读不到 eKey）一并告诉用户，而不是只说"已跳过" */
            failures.push(`${f.name}：未提供 eKey，已跳过（${e.message || e}）`);
          } else {
            try {
              /* QMC2 的 eKey 是客户端加密封装过的 base64 串（引擎内部还要再解一层），
               * 乱填/漏字符只会得到英文 Rust 报错，这里翻译成用户能看懂并知道怎么做的提示 */
              let cipher;
              try {
                cipher = new um.QMC2(ekey);
              } catch (eCipher) {
                throw new Error(
                  'eKey 无法使用：请确认整段原样复制（QQ 音乐 eKey 是被客户端加密封装的 base64 串，漏字符或换行都会失败）——' +
                    (eCipher.message || eCipher)
                );
              }
              const body = ne.buf.slice(ne.bodyStart, ne.bodyEnd);
              cipher.decrypt(body, 0);
              const det = detectExt(um, body);
              if (!det) {
                throw new Error('eKey 不正确：转换后无法识别音频格式，请核对密钥');
              }
              results.push({
                name: `${baseOf(f.name)}.${det}`,
                blob: new Blob([body], { type: MIME[det] || 'application/octet-stream' }),
              });
              ctx.setStatus(`${f.name} 转换成功（使用手动提供的 eKey）`, true);
            } catch (e2) {
              failures.push(`${f.name}：${e2.message || e2}`);
            }
          }
        } else {
          failures.push(`${f.name}：${e.message || e}`);
        }
      }
      ctx.setProgress((i + 0.9) / files.length);
      await App.nextFrame();
    }

    if (!results.length) {
      throw new Error(failures.length ? failures.join('；') : '没有可转换的文件');
    }
    ctx.setStatus(
      failures.length
        ? `成功 ${results.length} 个，失败 ${failures.length} 个 —— ${failures.join('；')}`
        : `全部转换成功（共 ${results.length} 个）`,
      true
    );
    return results;
  }

  /* ---------- 歌曲格式转换（网易云 / QQ音乐 / 酷我 / 酷狗老格式） ---------- */
  App.registerTool({
    id: 'music-decrypt',
    icon: '🎵',
    name: '歌曲格式转换',
    desc: '网易云 / QQ音乐 / 酷我 / 酷狗老格式(KGM·KGMA·VPR) 加密歌曲转 MP3 / FLAC / OGG',
    keywords: 'ncm qmc mflac mgg kwm kgm kgma vpr 网易云音乐 qq音乐 酷我 酷狗 歌曲格式转换 转换 音乐',
    category: 'music',
    accept: '.ncm,.qmc0,.qmc3,.qmcflac,.qmcogg,.qmcm,.mflac,.mgg,.mgg1,.kwm,.kgm,.kgma,.vpr',
    acceptText: 'ncm / qmc* / mflac / mgg / kwm / kgm / kgma / vpr',
    outputText: 'MP3 / FLAC / OGG · 自动按歌曲原始格式无损还原（QQ 新版 mgg/mflac 需按提示提供 eKey）',
    multiple: true,
    minFiles: 1,
    async run(files, opts, ctx) {
      return runDecrypt(files, ctx, MUSIC_EXTS);
    },
  });

  /* ---------- KGG 格式转换（酷狗最新 .kgg 格式专区） ---------- */
  App.registerTool({
    id: 'kgg-convert',
    icon: '🐶',
    name: 'KGG 格式转换',
    desc: '酷狗最新 .kgg 加密歌曲转 MP3 / FLAC / OGG（v3 离线直解；v5 按提示提供 eKey）',
    keywords: 'kgg 酷狗 kugou 歌曲格式转换 转换 音乐',
    category: 'music',
    accept: '.kgg',
    acceptText: 'kgg（酷狗最新格式）',
    outputText: 'MP3 / FLAC / OGG · 自动按歌曲原始格式无损还原（v5 需按提示提供 eKey）',
    multiple: true,
    minFiles: 1,
    async run(files, opts, ctx) {
      return runDecrypt(files, ctx, KGG_EXTS);
    },
  });
})();
