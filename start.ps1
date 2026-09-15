# 万象转换 本地服务启动器（幂等：可重复运行，不会端口冲突、不会重复开浏览器）
# 1) 结束占用该端口的旧服务进程（只针对由 PowerShell 承载的监听进程，避免误杀别的程序）
# 2) 以最小化窗口启动 server.ps1
# 3) 等端口就绪后打开一次浏览器
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File start.ps1 [-Port 8137] [-NoBrowser]
param(
  [int]$Port = 8137,
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'

# ---------- 1. 接管旧服务：只杀「监听本端口、且由 powershell/pwsh 承载」的进程 ----------
$oldPids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($id in $oldPids) {
  $p = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($p -and ($p.ProcessName -like 'powershell*' -or $p.ProcessName -like 'pwsh*')) {
    Write-Host "关闭旧服务进程（PID $id）…"
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  }
}
# 给端口释放留一点时间
Start-Sleep -Milliseconds 400

# ---------- 2. 启动服务（最小化窗口） ----------
$server = Join-Path $PSScriptRoot 'server.ps1'
$argList = "-NoProfile -ExecutionPolicy Bypass -File `"$server`""
if ($Port -ne 8137) { $argList += " -Port $Port" }
Start-Process -FilePath 'powershell' -ArgumentList $argList -WindowStyle Minimized | Out-Null

# ---------- 3. 等端口就绪，最多约 10 秒 ----------
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  try {
    $c = [System.Net.Sockets.TcpClient]::new()
    $c.Connect('127.0.0.1', $Port)
    $c.Close()
    $ready = $true
    break
  } catch {
    Start-Sleep -Milliseconds 250
  }
}
if (-not $ready) {
  Write-Host "错误：服务未能在 10 秒内就绪（端口 $Port），请检查 server.ps1 是否报错。"
  exit 1
}

Write-Host "万象转换已启动： http://localhost:$Port （关闭后台的最小化 PowerShell 窗口即停止服务）"
if (-not $NoBrowser) {
  Start-Process "http://localhost:$Port/"
}
