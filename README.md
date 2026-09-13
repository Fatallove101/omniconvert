# 万象转换 OmniConvert

**中文** | [English](README.en.md)

参照 [BentoPDF](https://github.com/alam00000/bentopdf) / [Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) 设计的**纯浏览器端**文件格式转换工具。

**核心卖点：文件 100% 在本地处理，永不上传服务器。** 无后端、零部署成本、可离线使用（PWA），PC 与手机浏览器均可用。

## 快速开始

**只想用桌面版？[前往 Releases 下载](https://github.com/Fatallove101/omniconvert/releases/latest)**：
- [安装版 OmniConvert_v0.4.2_x64-setup.exe](https://github.com/Fatallove101/omniconvert/releases/download/v0.4.2/OmniConvert_v0.4.2_x64-setup.exe)（约 3.6MB：安装向导 + 开始菜单 + 可卸载）
- [绿色版 OmniConvert_v0.4.2_x64-portable.exe](https://github.com/Fatallove101/omniconvert/releases/download/v0.4.2/OmniConvert_v0.4.2_x64-portable.exe)（约 9.3MB：双击即用）

```
双击 start.bat
→ 自动启动本地服务并在浏览器打开 http://localhost:8137
```

也可以手动启动：`powershell -ExecutionPolicy Bypass -File server.ps1`（零依赖静态服务器，无需管理员权限）。

- 手机访问：让手机与电脑连同一 Wi-Fi，把 `server.ps1` 中监听地址改为 `IPAddress.Any`，防火墙放行 8137 端口后访问 `http://<电脑IP>:8137`
- 正式部署：整个目录是纯静态文件，可直接托管到 GitHub Pages / Nginx / 对象存储 + CDN

## 功能列表（23 个工具）

| 分类 | 工具 | 说明 |
| --- | --- | --- |
| PDF | 合并 | 多个 PDF 合为一个 |
| PDF | 拆分 | 每页一文件 / 页码范围（`1-3,5`）/ 每 N 页一组 |
| PDF | 转图片 | 每页导出 PNG/JPG，可选 96/150/300 DPI |
| PDF | 转 PPT | 图片型 PPTX，每页整页放入幻灯片（版式还原） |
| PDF | 转 Word | 图片型（版式还原）/ 文本型（可编辑）docx |
| PDF | 图片化 | 每页转整页图片重新打包，防复制/修改 |
| PDF | 图片转 PDF | 多图合成 PDF，**拖拽排序**、旋转、移除 |
| PDF | 压缩 | 页面重编码，适合图片/扫描型 PDF |
| PDF | 提取文本 | 导出 TXT（扫描件需 OCR，暂不支持） |
| PDF | 加水印 | 文字水印，支持中文、透明度、角度 |
| PDF | 页面重排 | 缩略图拖拽排序，删除/旋转页面 |
| PDF | 加密 | 密码保护（AES-256，qpdf WASM） |
| PDF | 解密 | 移除密码保护（需已知密码） |
| PDF | 旋转 | 全部或指定页顺/逆时针旋转 |
| 图片 | 格式转换 | JPG / PNG / WebP / HEIC / BMP 互转 |
| 图片 | 压缩 | 画质 + 最长边限制，显示节省比例 |
| 图片 | 尺寸调整 | 按百分比或指定宽高 |
| 图片 | HEIC 转 JPG | iPhone 照片转通用格式 |
| 图片 | ICO 图标生成 | 多尺寸 Windows / 网站图标（16~256） |
| 歌曲 | 歌曲格式转换 | NCM(网易云)、QMC/MFLAC/MGG(QQ音乐)、KWM(酷我) 转为 MP3/FLAC/OGG（引擎：unlock-music WASM） |
| KGG | KGG 格式转换 | 酷狗 KGG/KGMA/KGM/VPR 转为 MP3/FLAC/OGG（v3 离线直解；v5 需按提示提供 eKey 或密钥库） |
| 文档 | Word 转 PDF | docx 排版后调起打印「另存为 PDF」（适合普通文档） |
| 文档 | Excel ↔ CSV | xlsx/xls ↔ csv，自动识别方向 |
| 文档 | Word 转 HTML | docx → HTML 网页或纯文本 |
| 文档 | Markdown 转 HTML | 输出带样式的完整网页 |

> **歌曲转换的边界**：本工具做的是"解密还原"——去掉加密壳得到**原本就封装在内**的 MP3/FLAC/OGG（音质无损），**不做有损转码**（如 FLAC→MP3 需要音频编码器 ffmpeg，规划在路线图）。新版 QQ 音乐 MFLAC/MGG 文件必须内嵌 eKey（大部分 2020 年后的文件都有）；酷我 KWM v2 需要单独提取的密钥，暂不支持。仅限解密你拥有合法权利的个人歌曲文件。

> **关于"高保真可编辑转换"的边界**：PDF→Word/PPT 目前是图片型（版式 100% 还原但文字不可编辑）或文本型（可编辑但不还原排版）；PDF→Excel（表格结构还原）、Word→PDF 的高保真版式，需要 LibreOffice 等重引擎，规划在服务端模式（见路线图）。

### 体验细节

- **结果预览抽屉**：转换完成后可直接预览图片 / PDF 首页 / 文本内容（移动端为底部面板），文本类结果一键复制
- **暗色模式**：右上角切换，跟随系统 + 手动记忆
- **选项记忆**：每个工具记住你上次的参数（格式、画质、页码范围…）
- **最近使用**：首页快捷入口
- **PWA**：可安装到桌面 / 主屏，离线可用

## 架构说明

```
omniconvert/
├── index.html            # 单页应用入口
├── css/app.css           # 响应式样式（移动端优先）
├── js/
│   ├── app.js            # 框架：工具注册表、hash 路由、UI 渲染、进度/下载/ZIP
│   └── tools/            # 工具实现（每个文件一组，自动注册）
│       ├── pdf-tools.js
│       ├── image-tools.js
│       └── doc-tools.js
├── vendor/               # 本地化的开源转换引擎（离线可用）
│   ├── pdf-lib.min.js    # PDF 写入：合并/拆分/水印/旋转/图转PDF
│   ├── pdf.min.js        # PDF 读取/渲染：转图片/压缩/提文本
│   ├── pdf.worker.min.js
│   ├── jszip.min.js      # 多结果打包 ZIP
│   ├── xlsx.full.min.js  # SheetJS：Excel/CSV
│   ├── mammoth.browser.min.js  # docx 解析
│   ├── marked.min.js     # Markdown
│   └── heic2any.min.js   # HEIC 解码
├── assets/icons/         # PWA 图标
├── manifest.webmanifest  # PWA 清单（可安装到桌面/手机主屏）
├── sw.js                 # Service Worker：离线缓存（改代码后请升版本号）
├── server.ps1            # 零依赖本地静态服务器（TcpListener）
├── start.bat             # 一键启动
└── test/                 # 测试夹具生成脚本 + 夹具
```

**工作原理**：所有转换由浏览器内 JS 完成——PDF 写操作用 pdf-lib，PDF 渲染用 pdf.js（Web Worker），图片走 Canvas API，表格用 SheetJS。文件只在内存中流转，不产生任何网络上传。

**新增工具**：在 `js/tools/` 里调用 `App.registerTool({ id, name, desc, icon, category, accept, multiple, options, run })` 即可，首页卡片、路由、进度条、下载/打包全部自动获得。

## 产品路线图

### 1. 微信小程序 ✅ 骨架已就位（`miniprogram/`）

- **端内可用**：图片格式转换/压缩/缩放（Canvas 2D）、PDF 合并/拆分（pdf-lib，构建 npm 后可用）
- **云函数**：`miniprogram/cloudfunctions/convert` 预留 PDF 转图片、Office 转换等重活入口，免运维、免备案
- **接入步骤**：见 `miniprogram/README.md`（导入开发者工具 → 构建 npm → 部署云函数 → 真机预览）
- 注意：小程序选择 PDF 走「聊天记录选文件」；自建服务器方案域名必须 HTTPS + ICP 备案

### 2. PC 桌面端 ✅（Tauri 已就绪）

前端代码原样打包进 Tauri 壳（WebView2），产物两种：

- **绿色版**：`src-tauri/target/release/omniconvert.exe`（约 9MB，双击即用）
- **安装包**：`src-tauri/target/release/bundle/nsis/万象转换_x.y.z_x64-setup.exe`（约 3.6MB，NSIS 向导）

打包步骤（需 Rust MSVC + Node + VS Build Tools）：

```
npm install
powershell -ExecutionPolicy Bypass -File make-dist.ps1   # 只复制纯静态资源到 dist/
npm run tauri build
```

换图标：替换 `assets/icons/icon-512.png` 后运行 `npm run tauri icon`。

### 3. 服务端模式（可选）

Office → PDF 的高保真转换、OCR 需要重引擎（LibreOffice / Tesseract）。可加一个 FastAPI + LibreOffice 的可选后端，界面保持不变，检测到该类任务时上传处理——即 Stirling-PDF 模式。

### 4. 功能增强

- [x] PDF 加密 / 解密（qpdf-wasm，同 BentoPDF 方案）
- [x] PDF 页面重排（拖拽排序、删除页）
- [ ] OCR 文字识别（tesseract.js）
- [ ] Word → PDF 高保真转换（依赖服务端模式）
- [ ] 多语言 UI

## 合规与风险边界

> 以下为工程合规说明，不构成法律意见。

你应当只在以下前提下使用本项目：

- 仅处理**你本人拥有合法访问权限的本地文件**；
- 自行确认你的使用行为符合所在地法律、版权规则、平台协议与组织政策。

请勿将本项目用于以下用途：

- 批量分发、倒卖、牟利；
- 规避付费授权。

本项目不承诺以下事项：

- 不承诺适用于所有地区、所有平台规则、所有用途；
- 不承诺一定符合你所在地区的合规要求；
- 不承诺任何特定商业用途可直接使用；
- 不为用户的侵权、违约或违规使用承担责任。

## 隐私

所有转换均在你的设备浏览器内完成，不采集、不上传任何文件数据。Service Worker 仅缓存应用代码用于离线运行。

## 测试

`test/make-fixtures.ps1` 生成各类测试文件（PNG/JPG/双页PDF/CSV/XLSX/DOCX/MD）。已实测通过的流程：合并、拆分、转图片、图片转 PDF、压缩、提取文本、加水印（含中文渲染）、旋转、图片三件套、Excel↔CSV 双向、Word→HTML/TXT、Markdown→HTML。
