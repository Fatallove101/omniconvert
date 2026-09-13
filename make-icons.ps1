# 生成应用图标（PWA 用）：渐变圆角方块 + “万”字
# 运行：powershell -ExecutionPolicy Bypass -File make-icons.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-Icon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'

  $g.Clear([System.Drawing.Color]::Transparent)

  # 圆角矩形渐变背景
  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $radius = [int]($size * 0.22)
  $pathObj = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $pathObj.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $pathObj.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $pathObj.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $pathObj.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $pathObj.CloseFigure()

  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 79, 70, 229),
    [System.Drawing.Color]::FromArgb(255, 147, 51, 234),
    45)
  $g.FillPath($brush, $pathObj)

  # 中心“万”字
  $fontSize = [int]($size * 0.52)
  $font = New-Object System.Drawing.Font('Microsoft YaHei UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $fmt.LineAlignment = 'Center'
  $textBrush = [System.Drawing.Brushes]::White
  $g.DrawString('万', $font, $textBrush, (New-Object System.Drawing.RectangleF(0, ($size * 0.02), $size, $size)), $fmt)

  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "已生成 $path"
}

New-Icon 512 (Join-Path $PSScriptRoot 'assets\icons\icon-512.png')
New-Icon 192 (Join-Path $PSScriptRoot 'assets\icons\icon-192.png')
Write-Host '图标生成完毕'
