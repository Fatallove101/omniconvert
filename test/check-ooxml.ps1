# 校验 ooxml.js 中手写的 XML 模板是否合法：
# 1) 从 ooxml.js 提取静态模板；2) 重建 document.xml 动态样例；3) 逐部件 [xml] 解析
$ErrorActionPreference = 'Stop'
$src = [IO.File]::ReadAllText('C:\1\omniconvert\js\ooxml.js')

# —— 提取静态常量（JS 单引号串拼接 → 去掉引号/加号） ——
function Get-JsConst([string]$name) {
  # 匹配 "const NAME = ...;" 跨行块，取其中所有单引号字符串拼接
  $m = [regex]::Match($src, ('const\s+' + $name + '\s*=(.*?);'), [System.Text.RegularExpressions.RegexOptions]::Singleline)
  $body = $m.Groups[1].Value
  $parts = [regex]::Matches($body, "'((?:[^'\\]|\\.)*)'")
  ($parts | ForEach-Object { $_.Groups[1].Value.Replace("\\", "\") }) -join ''
}

$ct    = Get-JsConst 'CT_XML'
$rels  = Get-JsConst 'ROOT_RELS'
$core  = Get-JsConst 'CORE_XML'
$app   = Get-JsConst 'APP_XML'
$ns    = Get-JsConst 'DOC_NS'

# —— 动态重建：imagePara / sectPr / pageBreak（与 JS 模板一致） ——
function ImagePara($rid, $id, $cx, $cy) {
  '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing>' +
  '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
  "<wp:extent cx=`"$cx`" cy=`"$cy`"/>" +
  '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
  "<wp:docPr id=`"$id`" name=`"Picture $id`"/>" +
  '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
  "<pic:pic><pic:nvPicPr><pic:cNvPr id=`"$id`" name=`"image$id`"/><pic:cNvPicPr/></pic:nvPicPr>" +
  "<pic:blipFill><a:blip r:embed=`"$rid`"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>" +
  '<pic:spPr><a:xfrm><a:off x="0" y="0"/>' +
  "<a:ext cx=`"$cx`" cy=`"$cy`"/></a:xfrm>" +
  '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
  '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
}

$img1 = ImagePara 'rId1' 1 5848905 7620000
$img2 = ImagePara 'rId2' 2 5848905 7620000
$pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
$sectZero = '<w:sectPr><w:pgSz w:w="595" w:h="842"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>'
$sectA4 = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>'

$docImage = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + "<w:document $ns><w:body>" + $img1 + $pageBreak + $img2 + $sectZero + '</w:body></w:document>'
$docText  = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + "<w:document $ns><w:body>" +
  '<w:p><w:r><w:t xml:space="preserve">测试 &lt;中文&gt; 文本 "引号" &amp; 符号</w:t></w:r></w:p>' + $pageBreak + $sectA4 + '</w:body></w:document>'

# —— 逐部件解析 ——
$checks = @(
  @('[Content_Types].xml', $ct),
  @('_rels/.rels', $rels),
  @('docProps/core.xml', $core),
  @('docProps/app.xml', $app),
  @('word/document.xml (image型)', $docImage),
  @('word/document.xml (text型)', $docText)
)
$fail = 0
foreach ($c in $checks) {
  try {
    $x = New-Object System.Xml.XmlDocument
    $x.LoadXml($c[1])
    Write-Host ("PASS  " + $c[0])
  } catch {
    $fail++
    Write-Host ("FAIL  " + $c[0] + "  ->  " + $_.Exception.Message)
  }
}
if ($fail -gt 0) { exit 1 } else { Write-Host '全部 XML 模板合法' }
