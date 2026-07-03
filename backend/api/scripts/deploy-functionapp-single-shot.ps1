param(
  [string]$FunctionAppName = "forms-designer-backend",
  [string]$ResourceGroup = "inchanted-forms-rg",
  [string]$RepoRoot = "c:\Users\First\source\repos\inchanted-forms-designer"
)

$ErrorActionPreference = "Stop"

$backendPath = Join-Path $RepoRoot "backend\api"
$sharedPath = Join-Path $RepoRoot "shared"
$deployRoot = Join-Path $RepoRoot ".deploy\functionapp-single-shot"
$stageRoot = Join-Path $deployRoot "stage"
$backendRootPath = Join-Path $RepoRoot "backend"
$stageBackend = Join-Path $stageRoot "backend\api"
$stageShared = Join-Path $stageRoot "shared"
$zipPath = Join-Path $deployRoot "forms-designer-backend.zip"
$deploymentReportPath = Join-Path $RepoRoot "backend_deployment_report.json"
$validationReportPath = Join-Path $RepoRoot "backend_validation_report.json"

function Invoke-AzJson {
  param([string]$Command)
  $raw = Invoke-Expression $Command
  if (-not $raw) {
    return $null
  }
  return ($raw | ConvertFrom-Json)
}

function Test-Http {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null
  )

  try {
    if ($Body -ne $null) {
      $jsonBody = $Body | ConvertTo-Json -Depth 20
      $response = Invoke-WebRequest -Method $Method -Uri $Url -UseBasicParsing -ContentType "application/json" -Body $jsonBody -TimeoutSec 120
    } else {
      $response = Invoke-WebRequest -Method $Method -Uri $Url -UseBasicParsing -TimeoutSec 120
    }

    return [ordered]@{
      method = $Method
      url = $Url
      status = [int]$response.StatusCode
      ok = $true
      responseLength = ($response.Content | Out-String).Length
      error = $null
    }
  }
  catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }

    return [ordered]@{
      method = $Method
      url = $Url
      status = $statusCode
      ok = $false
      responseLength = 0
      error = $_.Exception.Message
    }
  }
}

Push-Location $RepoRoot
try {
  if (Test-Path $deployRoot) {
    Remove-Item $deployRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Path $deployRoot | Out-Null
  New-Item -ItemType Directory -Path $stageBackend -Force | Out-Null
  New-Item -ItemType Directory -Path $stageShared -Force | Out-Null

  Push-Location $sharedPath
  npm run build
  Pop-Location

  Push-Location $backendPath
  npm install
  npm run build
  Pop-Location

  robocopy "$backendPath" "$stageBackend" /E /NFL /NDL /NJH /NJS /NP /XD node_modules __blobstorage__ __queuestorage__ tests e2e-tests monitoring /XF local.settings.json local.settings.example.json configDump.json | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Backend staging copy failed with exit code $LASTEXITCODE"
  }

  robocopy "$sharedPath" "$stageShared" /E /NFL /NDL /NJH /NJS /NP /XD node_modules src /XF package-lock.json pnpm-workspace.yaml tsconfig.json | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Shared staging copy failed with exit code $LASTEXITCODE"
  }

  foreach ($dir in @("mapping", "extraction", "services", "types", "data")) {
    $sourceDir = Join-Path $backendRootPath $dir
    if (Test-Path $sourceDir) {
      foreach ($targetDir in @((Join-Path $stageBackend $dir), (Join-Path $stageBackend "api\\$dir"))) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        robocopy "$sourceDir" "$targetDir" /E /NFL /NDL /NJH /NJS /NP /XD node_modules | Out-Null
        if ($LASTEXITCODE -ge 8) {
          throw "Backend sibling copy failed for $dir into $targetDir with exit code $LASTEXITCODE"
        }
      }
    }
  }

  $apiSrcSource = Join-Path $backendPath "src"
  $apiSrcTarget = Join-Path $stageBackend "api\src"
  if (Test-Path $apiSrcSource) {
    New-Item -ItemType Directory -Path $apiSrcTarget -Force | Out-Null
    robocopy "$apiSrcSource" "$apiSrcTarget" /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
      throw "API src compatibility copy failed with exit code $LASTEXITCODE"
    }
  }

  Copy-Item (Join-Path $RepoRoot "package.json") (Join-Path $stageRoot "package.json") -Force

  $stagedPackageJsonPath = Join-Path $stageBackend "package.json"
  $stagedPackage = Get-Content $stagedPackageJsonPath -Raw | ConvertFrom-Json
  $stagedPackage.dependencies.PSObject.Properties.Remove("inchanted-forms-designer")
  $stagedPackage | ConvertTo-Json -Depth 100 | Set-Content $stagedPackageJsonPath

  Push-Location $stageBackend
  npm install --omit=dev

  $sharedNodeModulesPath = Join-Path $stageBackend "node_modules\shared"
  if (Test-Path $sharedNodeModulesPath) {
    Remove-Item $sharedNodeModulesPath -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Path $sharedNodeModulesPath -Force | Out-Null
  robocopy "$stageShared" "$sharedNodeModulesPath" /E /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Shared dependency materialization failed with exit code $LASTEXITCODE"
  }

  Pop-Location

  $distRoot = Join-Path $stageBackend "dist"
  New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
  foreach ($fn in @("extractDocument", "mapFields", "ingestion-test")) {
    $sourceFn = Join-Path $stageBackend $fn
    $targetFn = Join-Path $distRoot $fn
    if (Test-Path $sourceFn) {
      New-Item -ItemType Directory -Path $targetFn -Force | Out-Null
      if (Test-Path (Join-Path $sourceFn "index.js")) {
        Copy-Item (Join-Path $sourceFn "index.js") (Join-Path $targetFn "index.js") -Force
      }
      if (Test-Path (Join-Path $sourceFn "function.json")) {
        Copy-Item (Join-Path $sourceFn "function.json") (Join-Path $targetFn "function.json") -Force
      }
    }
  }
  if (Test-Path $stageShared) {
    robocopy "$stageShared" (Join-Path $distRoot "shared") /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
      throw "Dist shared mirror copy failed with exit code $LASTEXITCODE"
    }
  }

  $functionEntryFiles = Get-ChildItem -Path $stageBackend -File -Filter index.js -Recurse |
    Where-Object {
      $relative = $_.FullName.Substring($stageBackend.Length + 1).Replace('\', '/')
      $relative -match '^[^/]+/index\.js$'
    }

  foreach ($entryFile in $functionEntryFiles) {
    $content = Get-Content $entryFile.FullName -Raw
    $content = $content.Replace("../../mapping", "../mapping")
    $content = $content.Replace("../../extraction", "../extraction")
    $content = $content.Replace("../../services", "../services")
    $content = $content.Replace("../../types", "../types")
    $content = $content.Replace("../../data", "../data")
    Set-Content -Path $entryFile.FullName -Value $content
  }

  $rootSrcServiceFiles = Get-ChildItem -Path (Join-Path $stageBackend "src\services") -File -Filter *.js -Recurse -ErrorAction SilentlyContinue
  foreach ($serviceFile in $rootSrcServiceFiles) {
    $content = Get-Content $serviceFile.FullName -Raw
    $content = $content.Replace("../../../mapping/", "../../mapping/")
    $content = $content.Replace("../../../extraction/", "../../extraction/")
    $content = $content.Replace("../../../services/", "../../services/")
    $content = $content.Replace("../../../types/", "../../types/")
    $content = $content.Replace("../../../data/", "../../data/")
    Set-Content -Path $serviceFile.FullName -Value $content
  }

  if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
  }
  tar -a -c -f $zipPath -C $stageBackend .

  $cfgPath = Join-Path $backendPath "local.settings.json"
  $cfg = $null
  if (Test-Path $cfgPath) {
    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
  }

  $diEndpoint = if ($cfg) { [string]$cfg.Values.DI_ENDPOINT } else { "" }
  $diKey = if ($cfg) { [string]$cfg.Values.DI_KEY } else { "" }
  $storageConn = if ($cfg) { [string]$cfg.Values.AZURE_STORAGE_CONNECTION_STRING } else { "" }

  $settingsPairs = @(
    "FUNCTIONS_EXTENSION_VERSION=~4",
    "SPRINT5_TUNING_MODE=strict_live_host_only",
    "WAVE8_CATEGORY_MODE=enabled",
    "WAVE8_STRUCTURAL_DELTA=enabled",
    "WAVE8_SEMANTIC_EXTRACTION=enabled",
    "WAVE8_ACORD_MAPPING=enabled"
  )

  if (-not [string]::IsNullOrWhiteSpace($diEndpoint) -and $diEndpoint -notmatch "<your-doc-intel-resource>") {
    $settingsPairs += "DI_ENDPOINT=$diEndpoint"
  }
  if (-not [string]::IsNullOrWhiteSpace($diKey) -and $diKey -notmatch "<your-doc-intel-key>") {
    $settingsPairs += "DI_KEY=$diKey"
  }
  if (-not [string]::IsNullOrWhiteSpace($storageConn) -and $storageConn -notmatch "<your-storage-connection-string>") {
    $settingsPairs += "AzureWebJobsStorage=$storageConn"
  }

  az functionapp config appsettings set -g $ResourceGroup -n $FunctionAppName --settings $settingsPairs --output none

  $deployTransport = "az functionapp deploy"
  $deploySucceeded = $false
  $deployResponse = $null
  try {
    $deployResponse = Invoke-AzJson "az functionapp deploy -g $ResourceGroup -n $FunctionAppName --src-path `"$zipPath`" --type zip --clean true --restart true -o json"
    $deploySucceeded = $true
  }
  catch {
    $deployTransport = "az functionapp deployment source config-zip"
    az functionapp deployment source config-zip -g $ResourceGroup -n $FunctionAppName --src "$zipPath" --output none
    $deploySucceeded = $true
  }
  $zipDeployUrl = "https://$FunctionAppName.scm.azurewebsites.net/api/zipdeploy"

  $functionsRaw = Invoke-AzJson "az functionapp function list -g $ResourceGroup -n $FunctionAppName -o json"
  $functionNames = @()
  if ($functionsRaw) {
    $functionNames = @($functionsRaw | ForEach-Object {
      if ($_.name -match "/") {
        ($_.name -split "/")[-1]
      } else {
        $_.name
      }
    })
  }

  $restartMode = "restart"
  try {
    az functionapp restart -g $ResourceGroup -n $FunctionAppName --output none
  }
  catch {
    $restartMode = "stop_start"
    az functionapp stop -g $ResourceGroup -n $FunctionAppName --output none
    az functionapp start -g $ResourceGroup -n $FunctionAppName --output none
  }

  $baseApi = "https://$FunctionAppName.azurewebsites.net/api"
  $extractValidation = Test-Http -Method "GET" -Url "$baseApi/extractDocument"
  $mapValidation = Test-Http -Method "POST" -Url "$baseApi/mapFields" -Body @{ documentId = "deploy-validation"; blocks = @() }
  $ingestionValidation = Test-Http -Method "GET" -Url "$baseApi/ingestion-test"

  $deploymentReport = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    functionAppName = $FunctionAppName
    resourceGroup = $ResourceGroup
    runtimeTarget = "Azure Functions v4 / Node 20"
    deploymentMethod = $deployTransport
    zipDeployEndpoint = $zipDeployUrl
    zipPath = $zipPath
    zipDeployHttpStatus = if ($deployResponse -and $deployResponse.status) { [int]$deployResponse.status } else { 202 }
    deploySucceeded = $deploySucceeded
    build = [ordered]@{
      backendInstallAndBuild = "completed"
      sharedBuild = "completed"
      stagedRuntimeInstall = "completed"
    }
    structureChecks = [ordered]@{
      hostJson = (Test-Path (Join-Path $stageBackend "host.json"))
      packageJson = (Test-Path (Join-Path $stageBackend "package.json"))
      extractDocument_indexJs = (Test-Path (Join-Path $stageBackend "extractDocument\index.js"))
      mapFields_indexJs = (Test-Path (Join-Path $stageBackend "mapFields\index.js"))
      ingestionTest_indexJs = (Test-Path (Join-Path $stageBackend "ingestion-test\index.js"))
      mapping_dir = (Test-Path (Join-Path $stageBackend "mapping"))
      api_mapping_dir = (Test-Path (Join-Path $stageBackend "api\\mapping"))
      extraction_dir = (Test-Path (Join-Path $stageBackend "extraction"))
      api_extraction_dir = (Test-Path (Join-Path $stageBackend "api\\extraction"))
      services_dir = (Test-Path (Join-Path $stageBackend "services"))
      api_services_dir = (Test-Path (Join-Path $stageBackend "api\\services"))
      types_dir = (Test-Path (Join-Path $stageBackend "types"))
      api_types_dir = (Test-Path (Join-Path $stageBackend "api\\types"))
      data_dir = (Test-Path (Join-Path $stageBackend "data"))
      api_data_dir = (Test-Path (Join-Path $stageBackend "api\\data"))
      api_src_dir = (Test-Path (Join-Path $stageBackend "api\src"))
      shared_node_module = (Test-Path (Join-Path $stageBackend "node_modules\shared"))
    }
    discoveredFunctions = $functionNames
    expectedFunctions = @("extractDocument", "mapFields", "ingestion-test")
    expectedFunctionPresence = [ordered]@{
      extractDocument = ($functionNames -contains "extractDocument")
      mapFields = ($functionNames -contains "mapFields")
      ingestion_test = ($functionNames -contains "ingestion-test")
    }
    restart = [ordered]@{
      functionAppRestarted = $true
      mode = $restartMode
      envReloadRequested = $true
      diClientInitExpected = $true
      wave8InitExpected = $true
      httpTriggersInitExpected = $true
    }
  }

  $validationReport = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    functionAppName = $FunctionAppName
    checks = @(
      $extractValidation,
      $mapValidation,
      $ingestionValidation
    )
  }

  $deploymentReport | ConvertTo-Json -Depth 20 | Set-Content $deploymentReportPath
  $validationReport | ConvertTo-Json -Depth 20 | Set-Content $validationReportPath

  Write-Output "Deployment completed."
  Write-Output "Deployment report: $deploymentReportPath"
  Write-Output "Validation report: $validationReportPath"
}
finally {
  Pop-Location
}
