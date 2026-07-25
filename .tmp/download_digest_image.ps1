$ErrorActionPreference = 'Stop'

$repo = 'wave9-backend-api'
$digest = 'sha256:7de7f022f4e217db4178d2351f1e5232248aef94a8c84c5eb8b72fbee1c27030'
$work = 'F:/inchanted-forms-designer/.tmp/image-inspect-7de7f022'
$layersDir = Join-Path $work 'layers'

New-Item -ItemType Directory -Force -Path $layersDir | Out-Null
Remove-Item -Force (Join-Path $layersDir 'layer-*.tar') -ErrorAction SilentlyContinue

$login = az acr login -n inchantedregistry --expose-token -o json | ConvertFrom-Json
$server = $login.loginServer
$refresh = $login.refreshToken

$tokenJson = curl.exe -sS -X POST "https://$server/oauth2/token" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "grant_type=refresh_token" --data-urlencode "service=$server" --data-urlencode "scope=repository:wave9-backend-api:pull" --data-urlencode "refresh_token=$refresh"
$access = ($tokenJson | ConvertFrom-Json).access_token
if (-not $access) {
  throw 'Failed to acquire access token'
}

$manifestRaw = az acr manifest show -r inchantedregistry -n "$repo@$digest" --raw -o tsv
Set-Content -Path (Join-Path $work 'manifest.json') -Value $manifestRaw -NoNewline
$manifest = $manifestRaw | ConvertFrom-Json

$configDigest = $manifest.config.digest
$cfgOut = Join-Path $work 'config.json'
$cfgUrl = "https://$server/v2/$repo/blobs/$configDigest"
curl.exe --fail -sS -L -H "Authorization: Bearer $access" "$cfgUrl" -o "$cfgOut"

$i = 0
foreach ($layer in $manifest.layers) {
  $i++
  $ld = $layer.digest
  $out = Join-Path $layersDir ("layer-{0:D2}.tar" -f $i)
  $url = "https://$server/v2/$repo/blobs/$ld"
  Write-Output "Downloading $i/$($manifest.layers.Count): $ld"
  curl.exe --fail -sS -L -H "Authorization: Bearer $access" "$url" -o "$out"
}

Get-ChildItem $layersDir | Select-Object Name, Length | Format-Table -AutoSize
Write-Output 'download_complete'
