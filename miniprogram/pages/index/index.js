const tools = [
  {
    id: 'image',
    icon: '🖼️',
    name: '图片格式转换',
    desc: 'JPG/PNG 互转 · 压缩 · 缩放（端内完成，离线可用）',
    url: '/pages/image/image',
  },
  {
    id: 'pdf',
    icon: '📕',
    name: 'PDF 合并 / 拆分',
    desc: '基于 pdf-lib 端内完成（需先构建 npm）',
    url: '/pages/pdf/pdf',
  },
  {
    id: 'cloud',
    icon: '☁️',
    name: '更多转换（云函数）',
    desc: 'PDF 转图片、Word/Excel 转换等重活，部署 cloudfunctions/convert 后可用',
  },
];

Page({
  data: { tools },
  onTapTool(e) {
    const { url } = e.currentTarget.dataset;
    if (url) {
      wx.navigateTo({ url });
    } else {
      wx.showModal({
        title: '尚未部署',
        content: '请先在微信开发者工具中部署 cloudfunctions/convert 云函数，详见 miniprogram/README.md',
        showCancel: false,
      });
    }
  },
});
