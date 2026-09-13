/* ============================================================
 * 歌曲解密 — NCM / QMC / KGM / KWM → MP3 / FLAC / OGG
 * 引擎：unlock-music WASM（@clamber_l/crypto，MIT/Apache-2.0）
 * 说明：只做"解密还原"（去掉加密壳，得到原本的音频文件），
 *       不做有损转码（如 flac→mp3 需要音频编码器，见路线图）。
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
    vpr: 'flac',
    kwm: 'mp3',
  };

  /* 这些来源的格式嗅探失败时，允许按扩展名兜底（老格式算法成熟） */
  const TRUST_FALLBACK = {
    ncm: 1,
    qmc0: 1,
    qmc3: 1,
    qmcflac: 1,
    qmcogg: 1,
    qmcm: 1,
    mflac: 1,
    mgg: 1,
    mgg1: 1,
  };

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
   *  v5 → 需要酷狗客户端的 KGMusicV3.db 密钥库（暂不支持，明确报错） */
  async function decKGM(um, buf, name) {
    if (buf.length < 0x40) throw new Error('文件太小，不是有效的酷狗加密文件');
    const h = App.KGG.parseHeader(buf.subarray(0, 0x400));

    if (h.version >= 5) {
      throw new Error(
        '该文件为 KGG v5 加密（酷狗新版）。解密需要你自己电脑上酷狗客户端的密钥库 KGMusicV3.db，获取步骤：' +
        '① 在本机安装并登录酷狗音乐 PC 客户端；' +
        '② 在客户端内用你的账号下载这首歌（密钥只对你自己下载过的歌有效）；' +
        '③ 复制 C:\\Users\\你的用户名\\AppData\\Roaming\\KuGou8\\KGMusicV3.db 文件。' +
        '当前版本暂未支持 v5 自动读取密钥库，请将 KGMusicV3.db 提供给开发者以启用支持。仅限处理你自己账号下载的歌曲，请支持正版。'
      );
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

  /** QMC 系列（QQ音乐）：老静态映射(qmc0/3/flac/ogg) 与 内嵌 eKey 的 v2(mflac/mgg) */
  function decQMC(um, buf, name) {
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
    /* v1 静态映射：整文件原位解密（无尾部密钥） */
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

  App.registerTool({
    id: 'music-decrypt',
    icon: '🎵',
    name: '歌曲格式转换',
    desc: '网易云 / QQ音乐 / 酷狗(KGM/KGMA/KGG) / 酷我 加密歌曲转 MP3 / FLAC / OGG',
    keywords: 'ncm qmc kgm kgma vpr kgg kwm mflac mgg 网易云音乐 qq音乐 酷狗 酷我 歌曲格式转换 转换 音乐',
    category: 'music',
    accept: '.ncm,.qmc0,.qmc3,.qmcflac,.qmcogg,.qmcm,.mflac,.mgg,.mgg1,.kgm,.kgma,.kgg,.vpr,.kwm',
    acceptText: 'ncm / qmc* / mflac / mgg / kgm / kgma / kgg / vpr / kwm',
    outputText: 'MP3 / FLAC / OGG · 自动按歌曲原始格式无损还原（原文件是 FLAC 就输出 FLAC）',
    multiple: true,
    minFiles: 1,
    async run(files, opts, ctx) {
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
          const buf = new Uint8Array(await App.readAsArrayBuffer(f));
          const out = await fn(um, buf, f.name);
          if (!out || !out.length) throw new Error('转换结果为空');
          const det = detectExt(um, out);
          let ext = det || FALLBACK_EXT[extIn] || null;
          /* 输出自检：识别不出音频类型的，明确报错而不是输出损坏文件 */
          if (!ext || (!det && !TRUST_FALLBACK[extIn])) {
            throw new Error('转换后无法识别音频格式——该加密变体可能不支持离线转换（如酷狗新版 KGMA v3+，需要联网获取每首歌的密钥）');
          }
          results.push({
            name: `${baseOf(f.name)}.${ext}`,
            blob: new Blob([out], { type: MIME[ext] || 'application/octet-stream' }),
          });
        } catch (e) {
          failures.push(`${f.name}：${e.message || e}`);
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
    },
  });
})();
