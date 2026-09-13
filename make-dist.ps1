# 复制纯静态 Web 资源到 dist/（Tauri 打包用，排除开发/测试/小程序文件）
# 运行：powershell -ExecutionPolicy Bypass -File make-dist.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory $dist | Out-Null
foreach ($item in @('index.html', 'css', 'js', 'vendor', 'assets', 'manifest.webmanifest', 'sw.js')) {
  Copy-Item (Join-Path $root $item) (Join-Path $dist $item) -Recurse
}
$size = [math]::Round((Get-ChildItem $dist -Recurse | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "dist 已生成：$dist（$size MB）"
