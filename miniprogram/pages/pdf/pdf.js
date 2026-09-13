// PDF 合并 / 拆分（依赖 utils/pdf.js 与 pdf-lib）
const { mergePdfs, splitPdf } = require('../../utils/pdf');

Page({
  data: {
    mode: 'merge', // merge | split
    files: [], // { path, name, size }
    busy: false,
    status: '',
    results: [], // 输出文件路径
  },

  onModeChange(e) {
    this.setData({ mode: e.currentTarget.dataset.mode, files: [], results: [] });
  },

  chooseFiles() {
    const count = this.data.mode === 'merge' ? 9 : 1;
    wx.chooseMessageFile({
      count,
      type: 'file',
      extension: ['pdf'],
      success: (res) => {
        const files = res.tempFiles.map((f) => ({ path: f.path, name: f.name, size: f.size }));
        this.setData({ files, results: [], status: '' });
      },
    });
  },

  removeFile(e) {
    const i = +e.currentTarget.dataset.i;
    const files = this.data.files.slice();
    files.splice(i, 1);
    this.setData({ files });
  },

  async run() {
    const { mode, files } = this.data;
    if (!files.length) {
      wx.showToast({ title: '请先选择 PDF', icon: 'none' });
      return;
    }
    if (mode === 'merge' && files.length < 2) {
      wx.showToast({ title: '合并至少需要 2 个文件', icon: 'none' });
      return;
    }
    this.setData({ busy: true, status: '准备中…', results: [] });
    try {
      let outs = [];
      const onProgress = (s) => this.setData({ status: s });
      if (mode === 'merge') {
        const out = await mergePdfs(files.map((f) => f.path), onProgress);
        outs = [out];
      } else {
        outs = await splitPdf(files[0].path, onProgress);
      }
      this.setData({ results: outs, status: `完成，共 ${outs.length} 个文件` });
    } catch (e) {
      console.error(e);
      this.setData({ status: '转换失败：' + (e.message || e.errMsg || e) });
    } finally {
      this.setData({ busy: false });
    }
  },

  open(e) {
    const path = e.currentTarget.dataset.path;
    wx.openDocument({
      filePath: path,
      fileType: 'pdf',
      fail: () => wx.showToast({ title: '打开失败', icon: 'none' }),
    });
  },

  share(e) {
    const path = e.currentTarget.dataset.path;
    wx.shareFileMessage({
      filePath: path,
      fail: () => wx.showToast({ title: '分享已取消', icon: 'none' }),
    });
  },
});
