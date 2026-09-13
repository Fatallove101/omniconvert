# 万象转换小程序 — 接入指南

这是「万象转换」的微信小程序端骨架。与 Web 版同一套产品思路：

- **图片转换**（格式转换 / 压缩 / 缩放）：端内 Canvas 完成，**导入即可用**，离线可用
- **PDF 合并 / 拆分**：基于 pdf-lib 端内完成，**需构建一次 npm**
- **重型转换**（PDF 转图片、Office 转换、OCR）：走**微信云函数**，本项目已留好骨架

## 一、10 分钟跑起来

1. **准备工具**：下载安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（稳定版）
2. **导入项目**：打开开发者工具 → 导入 → 选择本目录 `miniprogram/` → AppID 先用「测试号」（游客模式）
   - 正式开发请在[微信公众平台](https://mp.weixin.qq.com)注册小程序并替换 `project.config.json` 里的 `appid`
3. **图片转换**：直接编译运行 → 首页 → 图片格式转换 → 选图 → 转换 → 保存相册 ✅
4. **PDF 功能**（构建 npm）：
   ```
   在开发者工具中：工具 → 构建 npm
   ```
   完成后 PDF 合并/拆分即可用。注意：小程序无法直接访问手机文件系统，PDF 通过
   「从聊天记录选择文件」进入（这是微信的标准做法：把 PDF 发给任意聊天 / 文件传输助手再选）。
5. **真机预览**：工具栏「预览」扫码即可在手机上使用

## 二、部署云函数（重活入口）

1. 开发者工具 → 顶部「云开发」→ 开通（有免费额度）→ 记下环境 ID
2. 把 `app.js` 中 `wx.cloud.init` 的 `env` 换成你的环境 ID
3. 右键 `cloudfunctions/convert` → 「上传并部署：云端安装依赖」
4. 测试：云开发控制台 → 云函数 → convert → 云端测试，参数 `{ "action": "ping" }`
5. 小程序端调用示例（首页「更多转换」当前弹窗提示未部署，接入后替换为真实调用）：
   ```js
   wx.cloud.uploadFile({ cloudPath: 'in.pdf', filePath }) // 先传文件
   wx.cloud.callFunction({ name: 'convert', data: { action: 'pdf-info', fileID } })
   ```

**实现 PDF 转图片**：在云函数中加 `pdfjs-dist`（legacy 版）+ `canvas` 依赖，逐页渲染为 PNG
后传回云存储。云函数内存建议调到 512MB 以上（云开发控制台可配）。

## 三、发布前的注意事项

- **类目与资质**：工具类小程序通常选「工具 > 信息查询/效率」类目；个人主体即可上架
- **隐私协议**：使用相册/文件能力需在平台后台配置《隐私保护指引》（相册写入权限声明）
- **域名**：纯端内转换 + 云开发**无需备案域名**；若改用自建服务器做后端，request 域名必须 HTTPS 且完成 ICP 备案
- **包体积**：主包 ≤ 2MB；pdf-lib 构建后约 1MB，若后续加更多引擎请使用分包

## 四、目录结构

```
miniprogram/
├── project.config.json     # 项目配置（appid、云函数根目录）
├── app.js / app.json / app.wxss
├── package.json            # 声明 pdf-lib（构建 npm 用）
├── pages/
│   ├── index/              # 工具首页
│   ├── image/              # 图片转换（端内可用）
│   └── pdf/                # PDF 合并/拆分（构建 npm 后可用）
├── utils/pdf.js            # pdf-lib 封装（含小程序环境补丁）
└── cloudfunctions/
    └── convert/            # 云函数骨架（ping / pdf-info 可直接用）
```

## 五、关于 uni-app

如需一套代码同时出 H5 + 小程序 + App，可把页面迁移到 uni-app（Vue 语法，`wx.*` 换成
`uni.*`）。本骨架逻辑与 UI 均可平移；Web 版（仓库根目录）无需改动，继续独立运行。
