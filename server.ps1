# 万象转换 本地静态服务器（零依赖，基于 TcpListener，无需管理员权限）
# 用法：powershell -ExecutionPolicy Bypass -File server.ps1 [-Port 8137]
param(
  [int]$Port = 8137,
  [string]$Root = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'

$Root = [System.IO.Path]::GetFullPath($Root)
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.webp' = 'image/webp'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
  '.pdf'  = 'application/pdf'
  '.woff' = 'font/woff'
  '.woff2'= 'font/woff2'
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "万象转换已启动： http://localhost:$Port   （按 Ctrl+C 停止）"

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 5000
    $stream = $client.GetStream()

    # 读取请求头
    $buf = New-Object byte[] 8192
    $sb = New-Object System.Text.StringBuilder
    while (-not $sb.ToString().Contains("`r`n`r`n")) {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      [void]$sb.Append([System.Text.Encoding]::ASCII.GetString($buf, 0, $n))
    }
    $reqLine = ($sb.ToString() -split "`r`n")[0]
    if (-not $reqLine) { $client.Close(); continue }
    $path = [Uri]::UnescapeDataString($reqLine.Split(' ')[1])
    $path = ($path -split '\?')[0]
    if ($path -eq '/') { $path = '/index.html' }

    # 防目录穿越
    $rel = $path.TrimStart('/') -replace '/', '\'
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
    if (-not $full.StartsWith($Root)) {
      $head = "HTTP/1.1 403 Forbidden`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
      $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      $client.Close()
      continue
    }

    if ([System.IO.File]::Exists($full)) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $head = "HTTP/1.1 200 OK`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
      $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      $stream.Write($bytes, 0, $bytes.Length)
    } else {
      $body = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
      $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      $stream.Write($body, 0, $body.Length)
    }
    $stream.Flush()
  } catch {
    Write-Host "请求处理异常： $_"
  } finally {
    $client.Close()
  }
}
