/* ============================================================
 * 歌曲文件体检 —— 判断哪些加密歌曲**能离线解密**、哪些**必须先拿到密钥**
 *
 * 覆盖平台与格式：
 *   网易云音乐：ncm
 *   QQ 音乐  ：qmc0/qmc3/qmcflac/qmcogg/qmcm（QMC1 静态映射）、mflac/mgg/mgg1/mmp4（QMC2 页脚）
 *   酷狗音乐 ：kgm/kgma/vpr/kgg（按头部版本：v1/v2/v3 可离线，v5 需 eKey）
 *   酷我音乐 ：kwm/kwms（v1 可离线，v2/kwms 需客户端密钥）
 *
 * 体检方式（只读文件、纯内存，不改动任何文件）：
 *   1) ncm                —— 解析 NCM 容器头取 audioOffset，真解密一次后嗅探输出类型
 *   2) qmc0/3/flac/ogg/m  —— 按 QMC1 静态映射真解密一次后嗅探
 *   3) mflac/mgg/mmp4     —— 解析尾部 1024B 页脚：有明文 eKey 才可能离线；musicex 页脚无 eKey
 *   4) kgm/kgma/vpr/kgg   —— 读容器头部版本号（0x14）：v1/v2/v3 可离线，v5 需该曲 eKey
 *   5) kwm/kwms           —— 先按 v1（0x400 头部）真解密一次，解不出即 v2/kwms，需客户端密钥
 *   结论分四档：✅ 可离线解密 / 🔑 需要密钥 / ❓ 无法判断 / ⛔ 不支持
 *   （酷狗按“文件里的版本号”判定，所以同一个 .kgma 扩展名：v3 显示 ✅、v5 才显示 🔑）
 *
 * 用法：
 *   node test/check-music.mjs <文件或目录> [更多路径...] [--no-verify] [--json]
 *   --no-verify  只做结构判定，不实际试解（更快）
 *   --json       以 JSON 输出（便于脚本消费）
 *
 * 退出码：0 = 全部可离线；1 = 存在需要密钥/不支持的文件；2 = 参数或环境错误
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

/* ---------- 平台/格式定义（单一事实来源，App 内工具也按同一套分组） ---------- */
export const PLATFORMS = {
  netease: { name: '网易云音乐', exts: ['ncm'] },
  qq: { name: 'QQ 音乐', exts: ['qmc0', 'qmc3', 'qmcflac', 'qmcogg', 'qmcm', 'mflac', 'mgg', 'mgg1', 'mmp4'] },
  kugou: { name: '酷狗音乐', exts: ['kgm', 'kgma', 'vpr', 'kgg'] },
  kuwo: { name: '酷我音乐', exts: ['kwm', 'kwms'] },
};
/** 扩展到工具的归属（App 里两个歌曲工具按此分组，自检会校验两边一致）：
 *  ALWAYS_OFFLINE_EXTS —— 密钥在文件里 / 静态映射，任何变体都能离线解；
 *  AMBIGUOUS_EXTS      —— **扩展名分不出来**的：同名格式可能是可离线的老变体，
 *                         也可能是需要该曲密钥的新变体（酷狗 v5、QQ musicex、酷我 v2/kwms）；
 *  SONG_TOOL_EXTS      —— 「歌曲格式转换」受理全部格式，先试离线，解不开的引导去密钥工具；
 *  KEY_TOOL_EXTS       —— 「密钥格式转换」受理这些模糊格式，就地弹窗引导取密钥。 */
export const ALWAYS_OFFLINE_EXTS = ['ncm', 'qmc0', 'qmc3', 'qmcflac', 'qmcogg', 'qmcm'];
export const AMBIGUOUS_EXTS = ['kgm', 'kgma', 'vpr', 'kgg', 'mflac', 'mgg', 'mgg1', 'mmp4', 'kwm', 'kwms'];
export const SONG_TOOL_EXTS = [...ALWAYS_OFFLINE_EXTS, ...AMBIGUOUS_EXTS];
export const KEY_TOOL_EXTS = [...AMBIGUOUS_EXTS];
export const ALL_EXTS = [...SONG_TOOL_EXTS];

/** 各平台密钥获取方式（体检报告与 App 弹窗共用同一套说法） */
export const KEY_HINTS = {
  kugou: '酷狗：密钥库 %APPDATA%\\KuGou8\\KGMusicV3.db（登录过酷狗 PC 客户端且下载过这首歌的电脑上有），可选文件自动提取；或手动粘贴该曲 eKey',
  qq: 'QQ 音乐：新版页脚 musicex 不含 eKey，密钥只在客户端运行期存在 —— 用客户端侧导出（客户端自带转换/导出，或用支持「运行期解密」的桌面工具，需 QQ 音乐保持运行），或粘贴该曲 eKey',
  kuwo: '酷我：用酷我客户端侧导出，或粘贴从客户端取得的该曲 eKey（v2/kwms 为尽力尝试，未验证）',
  netease: '网易云：ncm 密钥内嵌于文件，无需额外密钥',
};

const VERDICT = {
  OFFLINE: '✅ 可离线解密',
  KEY: '🔑 需要密钥',
  UNKNOWN: '❓ 无法判断',
  UNSUPPORTED: '⛔ 不支持',
};

export function extOf(name) {
  const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function platformOf(ext) {
  for (const [id, p] of Object.entries(PLATFORMS)) if (p.exts.includes(ext)) return id;
  return null;
}

/* ---------- 引擎：用仓库自带的 vendor/um/loader-inline.js（免开发目录依赖） ---------- */
export function loadEngine() {
  const src = fs.readFileSync(path.join(ROOT, 'vendor', 'um', 'loader-inline.js'), 'utf8');
  const shim = {};
  const sandbox = {
    window: {},
    exports: shim,
    module: { exports: shim },
    console,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    WebAssembly,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    setTimeout,
    clearTimeout,
    URL,
    fetch: async () => ({ ok: false, status: 404 }),
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'loader-inline.js' });
  const um = sandbox.window.exports && sandbox.window.exports.QMC2 ? sandbox.window.exports : shim;
  return { um, sandbox };
}

/** 仓库自带 KGG 解码器（真实发布代码，逻辑与页面一致） */
export function loadKgg() {
  const sandbox = { window: {}, console, TextDecoder, TextEncoder, Uint8Array, DataView, ArrayBuffer };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'kgg-decoder.js'), 'utf8'), sandbox, { filename: 'kgg-decoder.js' });
  return sandbox.window.App.KGG;
}

/* ---------- 判定：只看文件本身，不改动文件 ---------- */
function sniff(um, bytes) {
  try {
    const r = um.detectAudioType(bytes.slice(0, 4096));
    return r && r.audioType && r.audioType !== 'bin' ? r.audioType : null;
  } catch (e) {
    return null;
  }
}

/**
 * 判定单个文件能否离线解密。
 * @returns {{verdict:string, ok:boolean, platform:string|null, format:string, detail:string, keyHint?:string, trial?:string}}
 */
export function classifyFile(name, bytes, { um, KGG }, { trial = true } = {}) {
  const ext = extOf(name);
  const platform = platformOf(ext);
  const base = { platform, format: ext ? '.' + ext : '(无扩展名)', verdict: VERDICT.UNKNOWN, ok: false, detail: '' };
  if (!platform) return { ...base, verdict: VERDICT.UNSUPPORTED, detail: '不在支持的格式列表内' };

  /* 网易云 ncm：密钥内嵌，永远可离线 */
  if (ext === 'ncm') {
    let detail = 'NCM 容器：密钥内嵌在文件里，无需额外密钥';
    if (trial) {
      try {
        const f = new um.NCMFile();
        let need = 4096;
        let r = f.open(bytes.subarray(0, Math.min(bytes.length, need)));
        while (r > 0 && need < bytes.length) {
          need = Math.min(bytes.length, Math.max(r, need * 2));
          r = f.open(bytes.subarray(0, need));
        }
        if (r !== 0) throw new Error('NCM 头部解析失败');
        const off = f.audioOffset;
        const body = bytes.slice(off);
        f.decrypt(body, 0);
        const t = sniff(um, body);
        detail += t ? `；试解通过（输出 ${t}）` : '；试解后未能识别音频类型（文件可能不完整）';
        if (!t) return { ...base, verdict: VERDICT.UNKNOWN, detail };
      } catch (e) {
        return { ...base, verdict: VERDICT.UNKNOWN, detail: '不是有效的 NCM：' + (e.message || e) };
      }
    }
    return { ...base, verdict: VERDICT.OFFLINE, ok: true, detail };
  }

  /* QQ 音乐：QMC1 静态映射 vs QMC2 页脚 */
  if (['qmc0', 'qmc3', 'qmcflac', 'qmcogg', 'qmcm'].includes(ext)) {
    let detail = 'QMC1 静态映射：无页脚密钥，可离线';
    if (trial) {
      const body = bytes.slice(0);
      um.decryptQMC1(body, 0);
      const t = sniff(um, body);
      detail += t ? `；试解通过（输出 ${t}）` : '；试解后未能识别（该变体可能需要密钥）';
      if (!t) return { ...base, verdict: VERDICT.KEY, detail, keyHint: KEY_HINTS.qq };
    }
    return { ...base, verdict: VERDICT.OFFLINE, ok: true, detail };
  }

  if (['mflac', 'mgg', 'mgg1', 'mmp4'].includes(ext)) {
    let footer = null;
    try {
      footer = um.QMCFooter.parse(bytes.subarray(Math.max(0, bytes.length - 1024)));
    } catch (e) {
      footer = null;
    }
    if (footer && footer.ekey) {
      let detail = `QMC2 页脚含明文 eKey（mediaName=${footer.mediaName || '-'}）`;
      if (trial) {
        const body = bytes.slice(0, Math.max(0, bytes.length - (footer.size || 0)));
        new um.QMC2(footer.ekey).decrypt(body, 0);
        const t = sniff(um, body);
        detail += t ? `；试解通过（输出 ${t}）` : '；试解后未能识别（密钥可能不匹配）';
        if (!t) return { ...base, verdict: VERDICT.UNKNOWN, detail };
      }
      return { ...base, verdict: VERDICT.OFFLINE, ok: true, detail };
    }
    if (footer) {
      return {
        ...base,
        verdict: VERDICT.KEY,
        detail: `新版页脚（musicex 结构）：文件里不含 eKey（mediaName=${footer.mediaName || '-'}，页脚 ${footer.size} 字节）`,
        keyHint: KEY_HINTS.qq,
      };
    }
    return { ...base, verdict: VERDICT.KEY, detail: '页脚解析不出 eKey（文件可能不完整，或属于未知变体）', keyHint: KEY_HINTS.qq };
  }

  /* 酷狗：看头部版本 */
  if (['kgm', 'kgma', 'vpr', 'kgg'].includes(ext)) {
    let h;
    try {
      h = KGG.parseHeader(bytes.subarray(0, Math.min(bytes.length, 0x400)));
    } catch (e) {
      return { ...base, verdict: VERDICT.UNKNOWN, detail: '不是 KGG/KGM/VPR 容器：' + (e.message || e) };
    }
    if (h.version >= 5) {
      return {
        ...base,
        format: `.${ext}（酷狗 v${h.version}）`,
        verdict: VERDICT.KEY,
        detail: `酷狗 v${h.version}：每首歌的 eKey 只存在于客户端/密钥库${h.audioHash ? `（audio_hash=${h.audioHash}）` : ''}`,
        keyHint: KEY_HINTS.kugou,
      };
    }
    if (h.version >= 3) {
      return { ...base, format: `.${ext}（酷狗 v${h.version}）`, verdict: VERDICT.OFFLINE, ok: true, detail: `酷狗 v${h.version}：内置解码器 + 离线公钥，可直接解密` };
    }
    return { ...base, format: `.${ext}（酷狗 v${h.version || 1}）`, verdict: VERDICT.OFFLINE, ok: true, detail: `酷狗 v${h.version || 1}：密钥内嵌于头部，可直接解密` };
  }

  /* 酷我：先按 v1 试解，解不出就是 v2/kwms */
  if (['kwm', 'kwms'].includes(ext)) {
    if (!trial) {
      return { ...base, verdict: VERDICT.KEY, detail: '酷我 KWM：v1 可离线；v2/kwms 需要客户端密钥（加 --trial 可实测判断）', keyHint: KEY_HINTS.kuwo };
    }
    const hdr = bytes.subarray(0, Math.min(bytes.length, 0x400));
    let v1Ok = false;
    try {
      const d = new um.KWMDecipherV1(hdr);
      const body = bytes.slice(0x400);
      d.decrypt(body, 0);
      v1Ok = !!sniff(um, body);
    } catch (e) {
      v1Ok = false;
    }
    if (v1Ok) return { ...base, verdict: VERDICT.OFFLINE, ok: true, detail: '酷我 KWM v1：试解通过，可离线解密' };
    return { ...base, verdict: VERDICT.KEY, detail: '酷我 v2 / kwms：v1 试解未通过，需要从客户端取得的该曲 eKey（本工具为尽力尝试）', keyHint: KEY_HINTS.kuwo };
  }

  return { ...base, verdict: VERDICT.UNSUPPORTED, detail: '不在支持的格式列表内' };
}

/* ---------- CLI ---------- */
function walk(target, out = []) {
  const st = fs.statSync(target);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(target, { withFileTypes: true })) walk(path.join(target, e.name), out);
  } else if (st.isFile()) {
    out.push(target);
  }
  return out;
}

function pad(s, n) {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
}

export async function main(argv) {
  const paths = argv.filter((a) => !a.startsWith('--'));
  const trial = !argv.includes('--no-verify');
  const asJson = argv.includes('--json');
  if (!paths.length) {
    console.log('用法：node test/check-music.mjs <文件或目录> [...] [--no-verify] [--json]');
    console.log('示例：node test/check-music.mjs "D:\\我的音乐"');
    return 2;
  }
  const { um } = loadEngine();
  const KGG = loadKgg();
  const engine = { um, KGG };

  const files = [];
  for (const p of paths) {
    if (!fs.existsSync(p)) {
      console.error('路径不存在：' + p);
      return 2;
    }
    files.push(...walk(path.resolve(p)));
  }
  const targets = files.filter((f) => ALL_EXTS.includes(extOf(f)));
  const skipped = files.length - targets.length;

  const rows = [];
  for (const f of targets) {
    const bytes = new Uint8Array(fs.readFileSync(f));
    const r = classifyFile(path.basename(f), bytes, engine, { trial });
    rows.push({ file: f, size: bytes.length, ...r });
  }

  if (asJson) {
    console.log(JSON.stringify({ scanned: files.length, skipped, rows }, null, 2));
    return rows.some((r) => !r.ok) ? 1 : 0;
  }

  console.log(`扫描 ${files.length} 个文件，其中加密歌曲 ${targets.length} 个（忽略其他 ${skipped} 个）${trial ? '，已试解验证' : '，仅结构判定'}\n`);
  if (!targets.length) {
    console.log('没有发现支持的加密歌曲格式。支持：' + ALL_EXTS.map((e) => '.' + e).join(' / '));
    return 0;
  }
  const grp = {};
  for (const r of rows) (grp[r.verdict] = grp[r.verdict] || []).push(r);
  for (const v of [VERDICT.OFFLINE, VERDICT.KEY, VERDICT.UNKNOWN, VERDICT.UNSUPPORTED]) {
    if (!grp[v]) continue;
    console.log(`===== ${v}（${grp[v].length}）=====`);
    for (const r of grp[v]) {
      const name = path.basename(r.file);
      console.log(`  ${pad(name.length > 42 ? name.slice(0, 39) + '…' : name, 44)} ${pad(r.format, 18)} ${(r.size / 1048576).toFixed(1)}MB`);
      console.log(`      ${r.detail}`);
      if (r.keyHint) console.log(`      ↳ 取密钥：${r.keyHint}`);
    }
    console.log('');
  }
  console.log(`汇总：可离线 ${(grp[VERDICT.OFFLINE] || []).length} · 需要密钥 ${(grp[VERDICT.KEY] || []).length} · 无法判断 ${(grp[VERDICT.UNKNOWN] || []).length} · 不支持 ${(grp[VERDICT.UNSUPPORTED] || []).length}`);
  const needKey = (grp[VERDICT.KEY] || []).length;
  if (needKey) {
    console.log('\n需要密钥的文件：可用本项目的「密钥格式转换」工具处理 —— 先把密钥库/该曲 eKey 按弹窗提示准备好，再拖进去转换。');
  }
  return rows.some((r) => !r.ok) ? 1 : 0;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => {
    console.error('体检失败：' + (e && e.message ? e.message : e));
    process.exit(2);
  });
}
