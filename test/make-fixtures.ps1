# 生成测试夹具：PNG / JPG / 双页 PDF / CSV / XLSX / DOCX
# 运行：powershell -ExecutionPolicy Bypass -File make-fixtures.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$dir = Join-Path $PSScriptRoot 'fixtures'

function Save-Utf8([string]$path, [string]$text, [System.Text.Encoding]$enc = $null) {
  if ($null -eq $enc) { $enc = New-Object System.Text.UTF8Encoding($false) }
  [System.IO.File]::WriteAllText($path, $text, $enc)
}

# ---------- 1. PNG（渐变 + 文字，800x600） ----------
$bmp = New-Object System.Drawing.Bitmap(800, 600)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$rect = New-Object System.Drawing.Rectangle(0, 0, 800, 600)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect,
  [System.Drawing.Color]::FromArgb(255, 79, 70, 229),
  [System.Drawing.Color]::FromArgb(255, 147, 51, 234), 45)
$g.FillRectangle($brush, $rect)
$font = New-Object System.Drawing.Font('Microsoft YaHei UI', 48, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('测试图片 Test PNG', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, 250, 800, 100)))
$g.Dispose()
$bmp.Save((Join-Path $dir 'sample.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# ---------- 2. JPG（实底 + 圆形 + 文字，1200x900） ----------
$bmp2 = New-Object System.Drawing.Bitmap(1200, 900)
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.SmoothingMode = 'AntiAlias'
$g2.TextRenderingHint = 'AntiAliasGridFit'
$g2.Clear([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
$g2.FillEllipse([System.Drawing.Brushes]::White, 480, 300, 240, 240)
$font2 = New-Object System.Drawing.Font('Microsoft YaHei UI', 54, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$g2.DrawString('JPG 测试图', $font2, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, 600, 1200, 120)))
$g2.Dispose()
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 85L)
$bmp2.Save((Join-Path $dir 'photo.jpg'), $jpegCodec, $encParams)
$bmp2.Dispose()

# ---------- 3. 双页 PDF（手工构造，xref 精确） ----------
$s5 = 'BT /F1 36 Tf 72 700 Td (OmniConvert - Page One - Hello) Tj ET'
$s7 = 'BT /F1 36 Tf 72 700 Td (OmniConvert - Page Two - World) Tj ET'
$objs = @(
  "1 0 obj`n<< /Type /Catalog /Pages 2 0 R >>`nendobj`n",
  "2 0 obj`n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>`nendobj`n",
  "3 0 obj`n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`nendobj`n",
  "4 0 obj`n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >> /Contents 7 0 R >>`nendobj`n",
  "5 0 obj`n<< /Length $($s5.Length) >>`nstream`n$s5`nendstream`nendobj`n",
  "6 0 obj`n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`nendobj`n",
  "7 0 obj`n<< /Length $($s7.Length) >>`nstream`n$s7`nendstream`nendobj`n"
)
$body = ''
$offsets = @()
$pos = "%PDF-1.4`n".Length
foreach ($o in $objs) {
  $offsets += $pos
  $body += $o
  $pos += $o.Length
}
$xref = 'xref' + "`n" + "0 $($objs.Count + 1)" + "`n" + ('{0:D10} 65535 f ' -f 0) + "`n"
for ($i = 0; $i -lt $objs.Count; $i++) {
  $xref += ('{0:D10} 00000 n ' -f $offsets[$i]) + "`n"
}
$trailer = "trailer`n<< /Size $($objs.Count + 1) /Root 1 0 R >>`nstartxref`n$pos`n%%EOF"
$ascii = New-Object System.Text.ASCIIEncoding
[System.IO.File]::WriteAllBytes((Join-Path $dir 'sample.pdf'),
  $ascii.GetBytes("%PDF-1.4`n" + $body + $xref + $trailer))

# ---------- 4. CSV ----------
Save-Utf8 (Join-Path $dir 'data.csv') "姓名,数量,单价`n张三,3,9.90`n李四,5,19.99`n王五,1,129.00`n"

# ---------- 5. XLSX（手工构造最小结构） ----------
$ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
$rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
$wbk = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
$wbrels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
$sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>姓名</t></is></c><c r="B1" t="inlineStr"><is><t>数量</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>张三</t></is></c><c r="B2"><v>3</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>李四</t></is></c><c r="B3"><v>5</v></c></row></sheetData></worksheet>'

function New-ZipFromStrings([string]$zipPath, [System.Collections.IDictionary]$parts) {
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  $fs = [System.IO.File]::Open($zipPath, 'Create')
  $zip = New-Object System.IO.Compression.ZipArchive($fs, 'Create')
  foreach ($k in $parts.Keys) {
    $entry = $zip.CreateEntry($k)
    $w = New-Object System.IO.StreamWriter($entry.Open(), (New-Object System.Text.UTF8Encoding($false)))
    $w.Write($parts[$k])
    $w.Dispose()
  }
  $zip.Dispose()
  $fs.Dispose()
}

New-ZipFromStrings (Join-Path $dir 'table.xlsx') @{
  '[Content_Types].xml'      = $ct
  '_rels/.rels'              = $rels
  'xl/workbook.xml'          = $wbk
  'xl/_rels/workbook.xml.rels' = $wbrels
  'xl/worksheets/sheet1.xml' = $sheet
}

# ---------- 6. DOCX（手工构造最小结构） ----------
$dct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
$drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
$doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>这是一个测试 Word 文档。</w:t></w:r></w:p><w:p><w:r><w:t>第二段：用于测试万象转换 OmniConvert。</w:t></w:r></w:p></w:body></w:document>'

New-ZipFromStrings (Join-Path $dir 'note.docx') @{
  '[Content_Types].xml' = $dct
  '_rels/.rels'         = $drels
  'word/document.xml'   = $doc
}

# ---------- 7. Markdown ----------
$nl = [char]10
$md = '# 测试文档' + $nl + $nl + '这是 **Markdown** 测试，含格式：' + $nl + $nl + '- 列表一' + $nl + '- 列表二' + $nl + $nl + '> 引用文字' + $nl
Save-Utf8 (Join-Path $dir 'readme.md') $md

Write-Host '夹具生成完毕：'
Get-ChildItem $dir | Format-Table Name, Length -AutoSize
