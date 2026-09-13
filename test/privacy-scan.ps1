# 隐私扫描：被跟踪文件 / Git 历史 / Release 二进制
# 用法：powershell -ExecutionPolicy Bypass -File privacy-scan.ps1 [-User <要排查的用户名>]
# 默认扫描当前系统登录用户名（本文件不硬编码任何用户名）
param([string]$User = $env:USERNAME)
$ErrorActionPreference = 'Continue'
$git = 'C:\Program Files\Git\cmd\git.exe'
$root = 'C:\1\omniconvert'
Set-Location $root
if (-not $User) { $User = 'UNKNOWN_USER' }

$hits = New-Object System.Collections.Generic.List[string]

# ---------- 1. 被跟踪文件内容 ----------
$files = & $git ls-files
foreach ($f in $files) {
  $full = Join-Path $root $f
  if (-not (Test-Path $full)) { continue }
  $t = [IO.File]::ReadAllText($full)
  if ($t.Contains($User)) { $hits.Add("$f => 用户名 $User") }
  foreach ($m in [regex]::Matches($t, 'C:\\\\Users\\\\[^\s"''<>)，。]+')) {
    $v = $m.Value
    if ($v -notmatch [regex]::Escape($User) -and $v -notmatch '用户名') { $hits.Add("$f => 路径 $v") }
  }
  foreach ($m in [regex]::Matches($t, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')) {
    if ($m.Value -notmatch 'local\.dev') { $hits.Add("$f => 邮箱 $($m.Value)") }
  }
  foreach ($m in [regex]::Matches($t, '(?i)(api[_-]?key|secret|password|token)\s*[:=]\s*["'']?[A-Za-z0-9+/=_-]{16,}')) {
    $hits.Add("$f => 疑似密钥 $($m.Value.Substring(0, [Math]::Min(60, $m.Value.Length)))")
  }
}

# ---------- 2. Git 提交历史（作者/邮箱/信息里的敏感串） ----------
$log = & $git log --format='%an|%ae|%s' --all
foreach ($line in $log) {
  $p = $line -split '\|', 2
  if ($p[1] -notmatch 'local\.dev') { $hits.Add("git历史 => 作者邮箱 $($p[1])") }
  if ($line.Contains($User)) { $hits.Add("git历史 => 提交信息含用户名: $line") }
}

# ---------- 3. Release 二进制（用户名字符串，ASCII + UTF16） ----------
foreach ($exe in @(
  "$root\src-tauri\target\release\omniconvert.exe",
  "$root\src-tauri\target\release\bundle\nsis\万象转换_0.2.1_x64-setup.exe"
)) {
  if (Test-Path $exe) {
    $bytes = [IO.File]::ReadAllBytes($exe)
    $s = [Text.Encoding]::ASCII.GetString($bytes)
    $u16 = [Text.Encoding]::Unicode.GetString($bytes)
    if ($s.Contains($User) -or $u16.Contains($User)) { $hits.Add("$(Split-Path -Leaf $exe) => 二进制含用户名 $User") }
    if ($s.Contains('C:\Users\')) { $hits.Add("$(Split-Path -Leaf $exe) => 二进制含 C:\Users\ 路径") }
  }
}

if ($hits.Count) {
  Write-Host '===== 发现以下内容 ====='
  $hits | Select-Object -Unique | ForEach-Object { Write-Host $_ }
  exit 1
} else {
  Write-Host '扫描完成：未发现隐私泄露'
}
