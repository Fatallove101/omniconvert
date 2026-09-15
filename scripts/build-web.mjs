// 生成纯静态 Web 部署产物到 dist/（GitHub Pages / Cloudflare Pages 用）
// 用法: node scripts/build-web.mjs
import { cpSync, rmSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// 只发布运行所需资源，排除 test/、src-tauri/、miniprogram/ 等
const entries = ['index.html', 'css', 'js', 'vendor', 'assets', 'manifest.webmanifest', 'sw.js'];
for (const e of entries) {
  cpSync(join(root, e), join(dist, e), { recursive: true });
}

// GitHub Pages 跳过 Jekyll，避免它改写或忽略文件
writeFileSync(join(dist, '.nojekyll'), '');

function totalSize(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    n += s.isDirectory() ? totalSize(p) : s.size;
  }
  return n;
}

console.log(`dist 已生成：${dist}（${(totalSize(dist) / 1048576).toFixed(2)} MB，含 .nojekyll）`);
