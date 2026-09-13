// 云函数 convert — 重型转换的占位骨架
// 部署：微信开发者工具中右键 cloudfunctions/convert → 上传并部署（云端安装依赖）
// 小程序端调用：wx.cloud.callFunction({ name: 'convert', data: { action: 'pdf-info', fileID } })
const cloud = require('wx-server-sdk');
const { PDFDocument } = require('pdf-lib');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { action, fileID } = event || {};

  try {
    // 从云存储下载输入文件（小程序端先 wx.cloud.uploadFile）
    let buffer = null;
    if (fileID) {
      const res = await cloud.downloadFile({ fileID });
      buffer = res.fileContent;
    }

    switch (action) {
      case 'ping':
        return { code: 0, msg: 'convert 云函数正常', time: Date.now() };

      case 'pdf-info': {
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        return { code: 0, pages: doc.getPageCount(), title: doc.getTitle() || '' };
      }

      case 'pdf-to-image':
        // TODO：引入 pdfjs-dist@legacy + canvas（Node 端渲染），云函数内存建议 512MB 以上
        // 思路：pdf.js 渲染每页为 PNG buffer → 上传云存储 → 返回 fileID 数组
        return { code: 'TODO', msg: '按 miniprogram/README.md 的方案实现' };

      case 'office-convert':
        // TODO：Office 高保真转换需要 LibreOffice，云函数不支持，需自建服务器（详见 README）
        return { code: 'TODO', msg: '建议自建服务器模式' };

      default:
        return { code: 'UNKNOWN_ACTION', msg: `未知 action: ${action}` };
    }
  } catch (e) {
    return { code: 'ERROR', msg: e.message };
  }
};
