$ErrorActionPreference = 'Stop'

$work = 'F:/inchanted-forms-designer/.tmp/image-inspect-7de7f022'
$layersDir = Join-Path $work 'layers'
$rootfs = Join-Path $work 'rootfs'

if (Test-Path $rootfs) {
  Remove-Item -Recurse -Force $rootfs
}
New-Item -ItemType Directory -Force -Path $rootfs | Out-Null

$layers = Get-ChildItem $layersDir -Filter 'layer-*.tar' | Sort-Object Name
foreach ($layer in $layers) {
  Write-Output "Extracting $($layer.Name)"
  tar -xf $layer.FullName -C $rootfs
}

Write-Output 'extract_complete'
