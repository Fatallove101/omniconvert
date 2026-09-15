// 自检：README 文档结构
//  ① 代码围栏必须配对（曾真实发生过：多出一个 ``` 导致后半篇正文被吞进代码块、GitHub 主页显示成源码）
//  ② 不允许出现相邻的空代码块（通常是编辑失误留下的多余围栏）
//  ③ <img> 引用的截图文件必须存在
//  ④ 下载链接的版本号必须与 src-tauri/tauri.conf.json 一致（防止版本漂移）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = ['README.md', 'README.en.md'];

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) {
    pass++;
    console.log('PASS', name);
  } else {
    fail++;
    const line = name + (extra ? '  → ' + extra : '');
    failures.push(line);
    console.log('FAIL', line);
  }
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8')).version;

for (const doc of DOCS) {
  const abs = path.join(ROOT, doc);
  check(`${doc} 存在`, fs.existsSync(abs));
  if (!fs.existsSync(abs)) continue;
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/);

  /* ① 围栏配对 */
  const fences = [];
  lines.forEach((l, i) => {
    if (l.trim() === '```') fences.push(i + 1);
  });
  check(`${doc}: 代码围栏配对（偶数个）`, fences.length % 2 === 0, `共 ${fences.length} 个，行号 ${fences.join(', ')}`);

  /* ② 相邻空块 */
  const adjacent = [];
  for (let i = 1; i < fences.length; i++) if (fences[i] - fences[i - 1] === 1) adjacent.push(fences[i]);
  check(`${doc}: 无相邻空代码块`, adjacent.length === 0, `疑似多余围栏行号 ${adjacent.join(', ')}`);

  /* ③ 截图存在 */
  const imgs = [...text.matchAll(/<img\s+src="([^"]+)"/g)].map((m) => m[1]);
  check(`${doc}: 引用了界面截图`, imgs.length >= 2, imgs.join(', '));
  for (const src of imgs) {
    check(`${doc}: 截图文件存在 ${src}`, fs.existsSync(path.join(ROOT, src)));
  }

  /* ④ 下载链接版本与 tauri.conf.json 一致 */
  const links = [...text.matchAll(/releases\/download\/(v[\d.]+)\//g)].map((m) => m[1]);
  const bad = links.filter((v) => v !== `v${version}`);
  check(`${doc}: 下载链接版本 = v${version}`, bad.length === 0, `发现 ${[...new Set(bad)].join(', ')}`);

  /* ⑤ 关键章节没被吞进代码块（用行首标记粗查） */
  check(`${doc}: 含「合规与风险边界 / Compliance」章节标题`, /^## (合规与风险边界|Compliance & Risk Boundary)/m.test(text));
}

console.log('');
if (fail) {
  console.log('===== 失败明细 =====');
  for (const f of failures) console.log('- ' + f);
}
console.log(`RESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
