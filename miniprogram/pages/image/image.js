// 图片格式转换 / 压缩 / 缩放 —— 全部在手机端内完成（Canvas 2D）
const fsm = wx.getFileSystemManager();

function sizeOf(path) {
  return new Promise((resolve, reject) =>
    fsm.getFileInfo({ filePath: path, success: (r) => resolve(r.size), fail: reject })
  );
}

Page({
  data: {
    format: 'jpg', // jpg | png
    quality: 80, // jpg 画质 1-100
    scale: 100, // 缩放百分比 10-200
    items: [], // { src, srcSize, outPath, outSize, outW, outH }
    busy: false,
    status: '',
  },

  async onReady() {
    // 获取离屏工作的 canvas 节点（type=2d）
    await new Promise((resolve) => {
      this.createSelectorQuery()
        .select('#work-canvas')
        .fields({ node: true })
        .exec((res) => {
          this.canvas = res[0] && res[0].node;
          resolve();
        });
    });
  },

  onFormatChange(e) {
    this.setData({ format: e.currentTarget.dataset.fmt });
  },
  onQualityChange(e) {
    this.setData({ quality: +e.detail.value });
  },
  onScaleChange(e) {
    this.setData({ scale: +e.detail.value });
  },

  chooseImages() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sizeType: ['original'],
      success: (res) => {
        const files = res.tempFiles.map((f) => ({ path: f.tempFilePath, size: f.size }));
        this.setData({ items: [], status: '' });
        this.convertAll(files);
      },
    });
  },

  async convertAll(files) {
    if (!this.canvas) {
      this.setData({ status: '画布未就绪，请重试' });
      return;
    }
    this.setData({ busy: true });
    try {
      for (let i = 0; i < files.length; i++) {
        this.setData({ status: `转换中 ${i + 1}/${files.length}…` });
        const item = await this.convertOne(files[i]);
        const items = this.data.items.concat([item]);
        this.setData({ items });
      }
      this.setData({ status: `完成，共 ${files.length} 张` });
    } catch (e) {
      console.error(e);
      this.setData({ status: '转换失败：' + (e.errMsg || e.message || e) });
    } finally {
      this.setData({ busy: false });
    }
  },

  async convertOne(file) {
    const { format, quality, scale: scalePct } = this.data;
    // 解码原图
    const img = await new Promise((resolve, reject) => {
      const im = this.canvas.createImage();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = file.path;
    });

    const k = scalePct / 100;
    const w = Math.max(1, Math.round(img.width * k));
    const h = Math.max(1, Math.round(img.height * k));

    // 绘制
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (format === 'jpg') {
      // JPG 不支持透明，铺白底
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);

    // 导出
    const outPath = await new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas: this.canvas,
        fileType: format,
        quality: quality / 100,
        success: (r) => resolve(r.tempFilePath),
        fail: reject,
      });
    });

    let outSize = 0;
    try {
      outSize = await sizeOf(outPath);
    } catch (e) { /* 忽略大小获取失败 */ }

    return { src: file.path, srcSize: file.size, outPath, outSize, outW: w, outH: h };
  },

  preview(e) {
    const path = e.currentTarget.dataset.path;
    wx.previewImage({ urls: [path] });
  },

  saveAll() {
    const outs = this.data.items.map((it) => it.outPath);
    if (!outs.length) return;
    const saveOne = (path) =>
      new Promise((resolve, reject) =>
        wx.saveImageToPhotosAlbum({ filePath: path, success: resolve, fail: reject })
      );
    (async () => {
      try {
        for (const p of outs) await saveOne(p);
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      } catch (e) {
        if (e && /auth/i.test(e.errMsg || '')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册',
            confirmText: '去设置',
            success: (r) => r.confirm && wx.openSetting(),
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    })();
  },
});
