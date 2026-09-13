// 万象转换小程序入口
App({
  onLaunch() {
    // 云开发：重活（PDF 转图片、Office 转换等）走云函数
    // 开通云开发后，把 env 换成你的云环境 ID（云开发控制台可查）
    if (wx.cloud) {
      // wx.cloud.init({ env: 'YOUR-CLOUD-ENV-ID', traceUser: true });
      wx.cloud.init({ traceUser: true });
    }
  },
  globalData: {},
});
