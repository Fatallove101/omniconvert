# vendor/um — 音乐解密引擎

来自 unlock-music 生态的官方 WASM（`@clamber_l/crypto` v0.1.12）。

- 许可证：MIT OR Apache-2.0（双许可，允许商用与再分发）
- 来源：npm 包 `@clamber_l/crypto`（https://www.npmjs.com/package/@clamber_l/crypto）
- 文件：
  - `loader-inline.js` —— 解密核心（wasm 已内联，经典脚本方式加载，暴露到 `window.exports`）
  - 能力：NCM / QMC1 / QMC2(mflac,mgg) / 酷狗 KGM,KGMA,VPR / 酷我 KWM / 虾米 / 喜马拉雅 / 歌词 QRC / 音频类型嗅探

万能转换 OmniConvert 仅调用其中的本地解密能力，所有处理均在本机浏览器内完成。
