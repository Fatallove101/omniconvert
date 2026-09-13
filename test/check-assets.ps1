[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
foreach ($n in @('OmniConvert_v0.4.2_x64-setup.exe', 'OmniConvert_v0.4.2_x64-portable.exe')) {
  try {
    $u = "https://github.com/Fatallove101/omniconvert/releases/download/v0.4.2/$n"
    $req = [Net.HttpWebRequest]::Create($u)
    $req.Method = 'HEAD'
    $req.AllowAutoRedirect = $true
    $resp = $req.GetResponse()
    Write-Host ($n + ' -> HTTP ' + [int]$resp.StatusCode + ' content-length=' + $resp.ContentLength)
    $resp.Close()
  } catch {
    Write-Host ($n + ' -> ' + $_.Exception.Message)
  }
}
