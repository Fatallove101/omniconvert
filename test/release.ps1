# 发布 OmniConvert 桌面版到 GitHub Releases（v0.4.2）
# 1) 从 Git 凭据管理器读取令牌（不显示） 2) 创建 Release 3) 上传两个安装包 4) 更新仓库简介
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'Fatallove101/omniconvert'
$tag = 'v0.4.2'

# ---------- 1. 令牌 ----------
$credInput = "protocol=https`nhost=github.com`n"
$credOut = $credInput | & 'C:\Program Files\Git\cmd\git.exe' credential fill 2>$null
$tokenLine = $credOut | Select-String '^password='
if (-not $tokenLine) { throw 'Git 凭据管理器中没有 github.com 的令牌，请先手动 git push 一次完成登录' }
$token = $tokenLine.Line.Substring(9)
Write-Host "令牌就绪（尾4位 $($token.Substring($token.Length - 4))）"
$headers = @{ Authorization = "token $token"; 'User-Agent' = 'omniconvert-release' }

# ---------- 2. 创建 / 复用 Release ----------
$bodyMd = @"
## 📦 桌面版下载（Windows 10/11）

| 文件 | 说明 |
| --- | --- |
| **OmniConvert_v0.4.2_x64-setup.exe** | 安装版（约 3.6MB）：安装向导 + 开始菜单 + 可卸载 |
| **OmniConvert_v0.4.2_x64-portable.exe** | 绿色版（约 9.3MB）：下载双击即用，无需安装 |

包含全部 24 个转换工具：PDF（合并/拆分/转图片/PPT/Word/加密/水印/重排…）、图片（格式转换/压缩/ICO…）、歌曲（NCM/QMC/KGG 解密）、文档（Excel↔CSV/Word/Markdown）。

🔒 **所有转换均在本地完成，文件永不上传。**
🌐 也有网页版与小程序形态，见 README。
"@ + "`n"

$rel = $null
try {
  $rel = Invoke-RestMethod -Headers $headers "https://api.github.com/repos/$repo/releases/tags/$tag"
  Write-Host "复用已有 Release #$($rel.id)"
} catch {
  $payload = @{ tag_name = $tag; name = '万象转换 v0.4.2 — 桌面版（网页版同源）'; body = $bodyMd; draft = $false; prerelease = $false } | ConvertTo-Json
  $rel = Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $payload "https://api.github.com/repos/$repo/releases"
  Write-Host "已创建 Release #$($rel.id)"
}
Write-Host "Release URL: $($rel.html_url)"

# ---------- 3. 删除同名旧附件后上传 ----------
function Upload($path, $name) {
  $size = [math]::Round((Get-Item $path).Length / 1MB, 1)
  $up = $rel.upload_url.Split('{')[0] + "?name=$name"
  Invoke-RestMethod -Method Post -Headers $headers -ContentType 'application/octet-stream' -InFile $path -Uri $up | Out-Null
  Write-Host "已上传: $name（$size MB）"
}

$existing = Invoke-RestMethod -Headers $headers "https://api.github.com/repos/$repo/releases/$($rel.id)/assets"
foreach ($old in $existing) {
  Invoke-RestMethod -Method Delete -Headers $headers "https://api.github.com/repos/$repo/releases/assets/$($old.id)" | Out-Null
  Write-Host "已删除旧附件: $($old.name)"
}

$relRoot = 'C:\1\omniconvert\src-tauri\target\release'
Upload (Join-Path $relRoot 'bundle\nsis\万象转换_0.2.1_x64-setup.exe') 'OmniConvert_v0.4.2_x64-setup.exe'
Upload (Join-Path $relRoot 'omniconvert.exe') 'OmniConvert_v0.4.2_x64-portable.exe'

# ---------- 4. 更新仓库简介（About） ----------
$patch = @{
  description = '纯浏览器端文件格式转换：PDF/图片/歌曲/文档 24 个工具，文件永不上传 | Local-first browser file converter (PDF/image/music/document), also ships as a Windows desktop app'
  homepage    = "https://github.com/$repo/releases/latest"
} | ConvertTo-Json
Invoke-RestMethod -Method Patch -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $patch "https://api.github.com/repos/$repo" | Out-Null
Write-Host '仓库简介已更新'

Write-Host "`n完成！Release 页面：$($rel.html_url)"
