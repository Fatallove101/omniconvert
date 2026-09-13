# 查看 exe 中 26951 / C-Users 的出现位置与上下文
$exe = 'C:\1\omniconvert\src-tauri\target\release\omniconvert.exe'
$bytes = [IO.File]::ReadAllBytes($exe)
$s = [Text.Encoding]::ASCII.GetString($bytes)

function ShowContext([string]$label, [string]$needle, [int]$max) {
  $positions = New-Object System.Collections.Generic.List[int]
  $i = $s.IndexOf($needle)
  while ($i -ge 0 -and $positions.Count -lt $max) {
    $positions.Add($i)
    $i = $s.IndexOf($needle, $i + 1)
  }
  Write-Host ($label + ' : count=' + $positions.Count)
  foreach ($p in $positions) {
    $a = [Math]::Max(0, $p - 60)
    $len = [Math]::Min(140, $s.Length - $a)
    $ctx = $s.Substring($a, $len) -replace '[^\x20-\x7e]', '.'
    Write-Host ('  off=' + $p + ' ctx=' + $ctx)
  }
}

ShowContext 'USER26951' '26951' 10
ShowContext 'USERS-PATH' 'C:\Users\' 10
