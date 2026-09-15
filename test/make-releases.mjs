/* ============================================================
 * 批量发布 GitHub Release —— 用 git 历史自动生成更新说明
 *
 * 为什么需要它：项目早期只给个别版本建过 Release，导致「做了很多迭代但
 * Releases 页面只有一条」。本脚本可按 tag 区间补齐历史，并为新版本发正式版。
 *
 * 用法（在仓库根目录执行）：
 *   node test/make-releases.mjs --list                  # 只列出 tag 与 Release 现状，不做改动
 *   node test/make-releases.mjs --backfill-missing      # 给所有"有 tag 但没 Release"的补建（不含附件）
 *   node test/make-releases.mjs --release v0.5.0        # 创建/更新某个版本的 Release
 *       [--assets "路径1;路径2"] [--asset-name-prefix OmniConvert] [--prerelease] [--draft]
 *       [--notes-file 文件.md]                          # 用现成文案（默认按 git 历史生成）
 *
 * 令牌：默认从 Git 凭据管理器读取（与 git push 同源），也可用环境变量 GH_TOKEN。
 * 说明：只做 GitHub API 调用，不改动本地仓库；重复执行是幂等的（已存在则更新文案）。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = process.env.GH_REPO || 'Fatallove101/omniconvert';
const API = 'https://api.github.com';
const GIT = process.env.GIT_EXE || 'C:\\Program Files\\Git\\cmd\\git.exe';

/* 旧版本正文顶部统一加的那行提示（--mark-old 用；正则用于幂等判断与撤销） */
const WARN_LINE = `⚠️ 旧版本，建议下载 [最新版](https://github.com/${REPO}/releases/latest)\n\n`;
const WARN_RE = /^⚠️ 旧版本，建议下载 \[最新版\]\([^)]*\)\n\n/;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

function git(args) {
  return execFileSync(GIT, args, { encoding: 'utf8' }).trim();
}

/* ---------- 令牌：优先环境变量，其次 Git 凭据管理器 ---------- */
function readToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const out = execFileSync(
      GIT,
      ['credential', 'fill'],
      { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' }
    );
    const line = out.split(/\r?\n/).find((l) => l.startsWith('password='));
    if (line) return line.slice('password='.length);
  } catch (e) {
    /* 落到下面报错 */
  }
  throw new Error('拿不到 GitHub 令牌（请先用 Git 凭据管理器登录一次，或设置 GH_TOKEN）');
}

const token = readToken();
const headers = {
  Authorization: `token ${token}`,
  'User-Agent': 'omniconvert-release',
  Accept: 'application/vnd.github+json',
};
console.log(`令牌就绪（尾 4 位 ${token.slice(-4)}），仓库 ${REPO}`);

/* ---------- HTTP 层：走 curl，并支持"指定 IP"绕过本机 hosts/DNS 屏蔽 ----------
 * 背景：有些机器的 hosts 会把 github.com / api.github.com / uploads.github.com 等
 * 指向 127.0.0.1（本地屏蔽或"加速器"残留），此时 fetch 必然失败。
 * curl 的 --resolve 优先级高于 hosts，因此用它显式指定 GitHub 边缘 IP。
 * 各主机真实 IP 可用公共 DNS 查（本机 hosts 会干扰默认解析）：
 *   powershell: Resolve-DnsName api.github.com -Server 8.8.8.8 -Type A -DnsOnly
 * 正常网络无需这些参数：设 GH_NO_RESOLVE=1 即可关闭；也可用下面三个环境变量覆盖。 */
const CURL = process.env.CURL_EXE || 'curl.exe';
const RESOLVE_MAP = {
  'api.github.com': process.env.GH_API_IP || '20.205.243.168',
  'uploads.github.com': process.env.GH_UPLOAD_IP || '20.205.243.161',
  'github.com': process.env.GH_WEB_IP || '20.205.243.166',
};
const USE_RESOLVE = process.env.GH_NO_RESOLVE !== '1';

function curlJson(method, url, { json = null, binaryFile = null } = {}) {
  const u = new URL(url);
  const args = ['-sS', '--max-time', '120', '-X', method, '-w', '\n__HTTP__%{http_code}'];
  if (USE_RESOLVE && RESOLVE_MAP[u.hostname]) args.push('--resolve', `${u.hostname}:443:${RESOLVE_MAP[u.hostname]}`);
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  let input;
  if (json !== null) {
    args.push('-H', 'Content-Type: application/json; charset=utf-8', '--data-binary', '@-');
    input = JSON.stringify(json);
  } else if (binaryFile) {
    args.push('-H', 'Content-Type: application/octet-stream', '--data-binary', `@${binaryFile}`);
  }
  const out = execFileSync(CURL, [...args, url], { encoding: 'utf8', input, maxBuffer: 32 * 1024 * 1024 });
  const m = out.match(/\n__HTTP__(\d+)\s*$/);
  const code = m ? Number(m[1]) : 0;
  const text = out.replace(/\n__HTTP__\d+\s*$/, '');
  if (code < 200 || code >= 300) throw new Error(`${method} ${u.pathname} → HTTP ${code} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const api = (method, url, body, rawFile = null) =>
  curlJson(method, url.startsWith('http') ? url : API + url, { json: body || null, binaryFile: rawFile });

/* ---------- 版本/tag 事实 ---------- */
const allTags = git(['tag', '--sort=creatordate']).split(/\r?\n/).filter(Boolean);

/** 解析版本号：v1.2.3 / v1.2.3-pre → [1,2,3, isPre]；用于按**版本**（而非 tag 创建顺序）排序 */
function parseVer(t) {
  const m = t.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!m) return null;
  return { core: [+m[1], +m[2], +m[3]], pre: m[4] || '' };
}
const tags = allTags.slice().sort((a, b) => {
  const A = parseVer(a);
  const B = parseVer(b);
  if (!A || !B) return a.localeCompare(b);
  for (let i = 0; i < 3; i++) if (A.core[i] !== B.core[i]) return A.core[i] - B.core[i];
  if (!A.pre && B.pre) return 1; /* 同核心版本：正式版排在 pre 之后 */
  if (A.pre && !B.pre) return -1;
  return A.pre.localeCompare(B.pre);
});
const isPreTag = (t) => /-pre$|-beta/.test(t);

function tagDate(t) {
  return git(['log', '-1', '--format=%ad', '--date=short', t]);
}
function commitsBetween(from, to) {
  const range = from ? `${from}..${to}` : to;
  return git(['log', range, '--no-merges', '--format=%s']).split(/\r?\n/).filter(Boolean);
}
/** 上一个参照 tag：正式版看上一个正式版（这样 v0.5.0 的说明覆盖 v0.4.2 以来的全部迭代）；
 *  pre 版看版本序上的前一个 tag。 */
function prevTagOf(t) {
  const i = tags.indexOf(t);
  if (i <= 0) return null;
  if (!isPreTag(t)) {
    for (let j = i - 1; j >= 0; j--) if (!isPreTag(tags[j])) return tags[j];
  }
  return tags[i - 1];
}
function shortSha(t) {
  return git(['rev-list', '-n', '1', '--abbrev-commit', t]);
}

/** 把提交标题按前缀归类成更新说明（真实提交信息，不编造） */
function buildNotes(tag) {
  const prev = prevTagOf(tag);
  const list = commitsBetween(prev, tag);
  const groups = { feat: [], fix: [], docs: [], other: [] };
  for (const s of list) {
    const m = s.match(/^(feat|fix|docs|chore|refactor|style|test|perf)(\([^)]*\))?[:：]\s*(.+)$/);
    if (m) groups[m[1] === 'feat' || m[1] === 'fix' || m[1] === 'docs' ? m[1] : 'other'].push(m[3]);
    else groups.other.push(s);
  }
  const lines = [];
  lines.push(`### 本次更新 / Changes（${prev ? `${prev} → ${tag}` : `至 ${tag}`}）`);
  lines.push('');
  const section = (title, arr) => {
    if (!arr.length) return;
    lines.push(`**${title}**`);
    for (const x of arr) lines.push(`- ${x}`);
    lines.push('');
  };
  section('✨ 新增功能', groups.feat);
  section('🐛 修复', groups.fix);
  section('📚 文档', groups.docs);
  section('🔧 其他', groups.other);
  lines.push(`> 提交范围：\`${prev ? shortSha(prev) : '(首个版本)'}..${shortSha(tag)}\`，共 ${list.length} 个提交（${tagDate(tag)}）`);
  return lines.join('\n');
}

function latestStableTag() {
  for (let i = tags.length - 1; i >= 0; i--) if (!isPreTag(tags[i])) return tags[i];
  return tags[tags.length - 1];
}

function bodyFor(tag, extraFooter = '') {
  /* 桌面版下载表只写给"最新正式版"；旧版的正文顶部另有"建议下载最新版"引导 */
  const desktopHint =
    tag === latestStableTag()
      ? `\n### 桌面版下载（Windows 10/11）\n\n| 文件 | 说明 |\n| --- | --- |\n| **OmniConvert_${tag}_x64-setup.exe** | 安装版：安装向导 + 开始菜单 + 可卸载 |\n| **OmniConvert_${tag}_x64-portable.exe** | 绿色版：双击即用，无需安装 |\n\n🔒 所有转换都在本机完成，文件永不上传。\n`
      : '';
  return `${bodyForPrefix(tag)}${buildNotes(tag)}\n${desktopHint}${extraFooter}`;
}
function bodyForPrefix(tag) {
  return `## 万象转换 OmniConvert ${tag}\n\n`;
}

/* ---------- 主流程 ---------- */
async function listState() {
  const releases = await api('GET', `/repos/${REPO}/releases?per_page=100`);
  const byTag = new Map(releases.map((r) => [r.tag_name, r]));
  console.log('\n tag            日期        已发 Release?   附件');
  for (const t of tags) {
    const r = byTag.get(t);
    console.log(`  ${t.padEnd(14)} ${tagDate(t)}  ${r ? '是' : '否'}            ${r ? r.assets.length : '-'}`);
  }
  return byTag;
}

async function ensureRelease(tag, { assets = [], prerelease = null, draft = false, notesFile = null, refreshOnly = false } = {}) {
  const releases = await api('GET', `/repos/${REPO}/releases?per_page=100`);
  let rel = releases.find((r) => r.tag_name === tag);
  const body = notesFile ? fs.readFileSync(notesFile, 'utf8') : bodyFor(tag);
  const isPre = prerelease === null ? isPreTag(tag) : prerelease;
  const payload = {
    tag_name: tag,
    name: `万象转换 ${tag} — 桌面版（网页版同源）`,
    body,
    draft,
    prerelease: isPre,
  };
  if (rel) {
    rel = await api('PATCH', `/repos/${REPO}/releases/${rel.id}`, payload);
    console.log(`  更新已有 Release ${tag}（id=${rel.id}，附件保留 ${rel.assets.length} 个）`);
  } else {
    rel = await api('POST', `/repos/${REPO}/releases`, payload);
    console.log(`  创建 Release ${tag}（id=${rel.id}，prerelease=${isPre}）`);
  }
  if (refreshOnly) return rel;
  for (const a of assets) {
    const p = path.resolve(a.path);
    const size = (fs.statSync(p).size / 1048576).toFixed(1);
    const up = rel.upload_url.split('{')[0] + `?name=${encodeURIComponent(a.name)}`;
    await api('POST', up, null, p);
    console.log(`    已上传 ${a.name}（${size} MB）`);
  }
  return rel;
}

const main = async () => {
  if (has('--list')) {
    await listState();
    return 0;
  }
  if (has('--backfill-missing')) {
    const byTag = await listState();
    console.log('\n补齐缺失的 Release：');
    for (const t of tags) {
      if (byTag.has(t)) continue;
      await ensureRelease(t);
    }
    return 0;
  }
  if (has('--refresh-notes')) {
    /* 只重算更新说明（保留已有附件）——改了区间规则或补了提交后用它刷新 */
    await listState();
    console.log('\n重刷所有 Release 的更新说明：');
    for (const t of tags) await ensureRelease(t, { refreshOnly: true });
    return 0;
  }
  if (has('--mark-old')) {
    /* 把"非最新版"的 Release 统一处理成：正文顶部加旧版提示 + 标为 pre-release。
     * 效果：GitHub 的 Latest 徽标只留在最新版上，旧版本不再占据"正式版"位置，
     *       但附件照旧可下载（回退能力保留）。加 --revert 可原样撤销。 */
    const revert = has('--revert');
    const releases = await api('GET', `/repos/${REPO}/releases?per_page=100`);
    const latest = await api('GET', `/repos/${REPO}/releases/latest`);
    const latestTag = latest && latest.tag_name;
    console.log(`最新版（保留 Latest 徽标）= ${latestTag}`);
    console.log(revert ? '\n撤销旧版标记：' : '\n标记旧版：');
    for (const r of releases) {
      if (r.tag_name === latestTag) {
        console.log(`  跳过 ${r.tag_name}（最新版）`);
        continue;
      }
      let body = r.body || '';
      if (revert) body = body.replace(WARN_RE, '');
      else if (!WARN_RE.test(body)) body = WARN_LINE + body;
      const payload = {
        tag_name: r.tag_name,
        name: r.name,
        body,
        prerelease: revert ? isPreTag(r.tag_name) : true,
        draft: r.draft,
      };
      await api('PATCH', `/repos/${REPO}/releases/${r.id}`, payload);
      console.log(`  ${r.tag_name.padEnd(12)} 正文${revert ? '已移除提示' : '已加旧版提示'}，prerelease=${payload.prerelease}，附件保留 ${r.assets.length} 个`);
    }
    return 0;
  }
  const tag = val('--release');
  if (tag) {
    const assetsArg = val('--assets', '');
    const prefix = val('--asset-name-prefix', 'OmniConvert');
    const assets = assetsArg
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => {
        const base = path.basename(p);
        const kind = /setup/i.test(base) ? 'setup' : 'portable';
        return { path: p, name: `${prefix}_${tag}_x64-${kind}.exe` };
      });
    await ensureRelease(tag, {
      assets,
      prerelease: has('--prerelease') ? true : has('--no-prerelease') ? false : null,
      draft: has('--draft'),
      notesFile: val('--notes-file'),
    });
    return 0;
  }
  console.log('用法：--list | --backfill-missing | --release <tag> [--assets "a;b"] [--prerelease] [--draft] [--notes-file f.md]');
  return 2;
};

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error('失败：' + (e && e.message ? e.message : e));
    process.exit(1);
  });
