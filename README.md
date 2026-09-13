# 万象转换 OmniConvert

参照 [BentoPDF](https://github.com/alam00000/bentopdf) / [Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) 设计的**纯浏览器端**文件格式转换工具。

**核心卖点：文件 100% 在本地处理，永不上传服务器。** 无后端、零部署成本、可离线使用（PWA），PC 与手机浏览器均可用。

## 快速开始

```
双击 start.bat
→ 自动启动本地服务并在浏览器打开 http://localhost:8137
```

也可以手动启动：`powershell -ExecutionPolicy Bypass -File server.ps1`（零依赖静态服务器，无需管理员权限）。

- 手机访问：让手机与电脑连同一 Wi-Fi，把 `server.ps1` 中监听地址改为 `IPAddress.Any`，防火墙放行 8137 端口后访问 `http://<电脑IP>:8137`
- 正式部署：整个目录是纯静态文件，可直接托管到 GitHub Pages / Nginx / 对象存储 + CDN

## 功能列表（17 个工具）

| 分类 | 工具 | 说明 |
| --- | --- | --- |
| PDF | 合并 | 多个 PDF 合为一个 |
| PDF | 拆分 | 每页一文件，或按页码范围（如 `1-3,5`） |
| PDF | 转图片 | 每页导出 PNG/JPG，可选 96/150/300 DPI |
| PDF | 图片转 PDF | 多图合成 PDF，A4 或跟随图片尺寸 |
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
| 文档 | Excel ↔ CSV | xlsx/xls ↔ csv，自动识别方向 |
| 文档 | Word 转 HTML | docx → HTML 网页或纯文本 |
| 文档 | Markdown 转 HTML | 输出带样式的完整网页 |

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

### 2. PC 桌面端（推荐 Tauri）

把本仓库作为前端资源打包成原生安装包（几 MB），功能零改动；需要系统级能力（右键菜单、文件关联）时用 Rust 侧扩展。Electron 亦可但体积大。

### 3. 服务端模式（可选）

Office → PDF 的高保真转换、OCR 需要重引擎（LibreOffice / Tesseract）。可加一个 FastAPI + LibreOffice 的可选后端，界面保持不变，检测到该类任务时上传处理——即 Stirling-PDF 模式。

### 4. 功能增强

- [x] PDF 加密 / 解密（qpdf-wasm，同 BentoPDF 方案）
- [x] PDF 页面重排（拖拽排序、删除页）
- [ ] OCR 文字识别（tesseract.js）
- [ ] Word → PDF 高保真转换（依赖服务端模式）
- [ ] 多语言 UI

## 隐私

所有转换均在你的设备浏览器内完成，不采集、不上传任何文件数据。Service Worker 仅缓存应用代码用于离线运行。

## 测试

`test/make-fixtures.ps1` 生成各类测试文件（PNG/JPG/双页PDF/CSV/XLSX/DOCX/MD）。已实测通过的流程：合并、拆分、转图片、图片转 PDF、压缩、提取文本、加水印（含中文渲染）、旋转、图片三件套、Excel↔CSV 双向、Word→HTML/TXT、Markdown→HTML。
