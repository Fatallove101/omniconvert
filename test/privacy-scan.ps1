# 隐私扫描：被跟踪文件 / Git 历史 / Release 二进制
$ErrorActionPreference = 'Continue'
$git = 'C:\Program Files\Git\cmd\git.exe'
$root = 'C:\1\omniconvert'
Set-Location $root

$hits = New-Object System.Collections.Generic.List[string]

# ---------- 1. 被跟踪文件内容 ----------
$files = & $git ls-files
foreach ($f in $files) {
  $full = Join-Path $root $f
  if (-not (Test-Path $full)) { continue }
  $t = [IO.File]::ReadAllText($full)
  if ($t -match '26951') { $hits.Add("$f => 用户名 26951") }
  foreach ($m in [regex]::Matches($t, 'C:\\\\Users\\\\[^\s"''<>)，。]+')) {
    $v = $m.Value
    if ($v -notmatch '用户名') { $hits.Add("$f => 路径 $v") }
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
  foreach ($m in [regex]::Matches($line, '26951')) { $hits.Add("git历史 => 提交信息含 26951: $($p[2])") }
}

# ---------- 3. Release 二进制（用户名字符串） ----------
foreach ($exe in @(
  "$root\src-tauri\target\release\omniconvert.exe",
  "$root\src-tauri\target\release\bundle\nsis\万象转换_0.2.1_x64-setup.exe"
)) {
  if (Test-Path $exe) {
    $bytes = [IO.File]::ReadAllBytes($exe)
    $s = [Text.Encoding]::ASCII.GetString($bytes)
    if ($s.Contains('26951')) { $hits.Add("$(Split-Path -Leaf $exe) => 二进制含 26951") }
    if ($s.Contains('C:\Users\')) { $hits.Add("$(Split-Path -Leaf $exe) => 二进制含 C:\Users\ 路径") }
    $u16 = [Text.Encoding]::Unicode.GetString($bytes)
    if ($u16.Contains('26951')) { $hits.Add("$(Split-Path -Leaf $exe) => 二进制(UTF16)含 26951") }
  }
}

if ($hits.Count) {
  Write-Host '===== 发现以下内容 ====='
  $hits | Select-Object -Unique | ForEach-Object { Write-Host $_ }
  exit 1
} else {
  Write-Host '扫描完成：未发现隐私泄露'
}
