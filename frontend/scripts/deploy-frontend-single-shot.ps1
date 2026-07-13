param(
  [string]$AppServiceName = "forms-designer",
  [string]$ResourceGroup = "inchanted-forms-rg",
  [string]$ApiBaseUrl = "https://inchanted-api-production.greenriver-7266e28c.eastus.azurecontainerapps.io",
  [string]$RepoRoot = "c:\Users\First\source\repos\inchanted-forms-designer"
)

$ErrorActionPreference = "Stop"

$frontendPath = Join-Path $RepoRoot "frontend"
$distPath = Join-Path $frontendPath "dist"
$deployRoot = Join-Path $RepoRoot ".deploy\frontend-single-shot"
$zipPath = Join-Path $deployRoot "forms-designer-frontend.zip"
$deploymentReportPath = Join-Path $RepoRoot "frontend_deployment_report.json"
$validationReportPath = Join-Path $RepoRoot "frontend_validation_report.json"
$siteUrl = ""
$designerUrl = ""
$ingestionTesterUrl = ""

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
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  try {
    if ($Body -ne $null) {
      $jsonBody = $Body | ConvertTo-Json -Depth 20
      $response = Invoke-WebRequest -Method $Method -Uri $Url -UseBasicParsing -Headers $Headers -ContentType "application/json" -Body $jsonBody -TimeoutSec 180
    }
    else {
      $response = Invoke-WebRequest -Method $Method -Uri $Url -UseBasicParsing -Headers $Headers -TimeoutSec 180
    }

    return [ordered]@{
      method = $Method
      url = $Url
      status = [int]$response.StatusCode
      ok = $true
      contentLength = ($response.Content | Out-String).Length
      error = $null
      bodyPreview = ($response.Content | Out-String).Substring(0, [Math]::Min(300, ($response.Content | Out-String).Length))
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
      contentLength = 0
      error = $_.Exception.Message
      bodyPreview = $null
    }
  }
}

Push-Location $RepoRoot
try {
  if (Test-Path $deployRoot) {
    Remove-Item $deployRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Path $deployRoot -Force | Out-Null

  if (Test-Path $distPath) {
    Remove-Item $distPath -Recurse -Force -ErrorAction SilentlyContinue
  }

  Push-Location $frontendPath
  npm install
  npm run build
  Pop-Location

  if (-not (Test-Path (Join-Path $distPath "index.html"))) {
    throw "Frontend build failed verification: dist/index.html is missing"
  }

  $assetFiles = Get-ChildItem -Path (Join-Path $distPath "assets") -File -Recurse -ErrorAction SilentlyContinue
  if (-not $assetFiles -or $assetFiles.Count -lt 2) {
    throw "Frontend build failed verification: expected hashed assets in dist/assets"
  }

  if (-not (Test-Path (Join-Path $distPath "env.js"))) {
    throw "Frontend build failed verification: runtime env loader dist/env.js is missing"
  }

  $designerAssetHit = Select-String -Path (Join-Path $distPath "assets\*.js") -Pattern "designer" -CaseSensitive:$false -ErrorAction SilentlyContinue | Select-Object -First 1
  $ingestionAssetHit = Select-String -Path (Join-Path $distPath "assets\*.js") -Pattern "ingestion-test|DocumentIngestionTester" -CaseSensitive:$false -ErrorAction SilentlyContinue | Select-Object -First 1

  if (-not $designerAssetHit) {
    throw "Frontend build verification failed: designer assets were not detected in JS bundles"
  }
  if (-not $ingestionAssetHit) {
    throw "Frontend build verification failed: ingestion tester assets were not detected in JS bundles"
  }

  az webapp config appsettings set -g $ResourceGroup -n $AppServiceName --settings "API_BASE_URL=$ApiBaseUrl" --output none

  $webAppMeta = Invoke-AzJson "az webapp show -g $ResourceGroup -n $AppServiceName -o json"
  if (-not $webAppMeta -or -not $webAppMeta.defaultHostName) {
    throw "Unable to resolve App Service host metadata"
  }

  $publicHost = [string]$webAppMeta.defaultHostName
  $scmHost = $null
  if ($webAppMeta.enabledHostNames) {
    $scmHost = $webAppMeta.enabledHostNames | Where-Object { $_ -like "*.scm.*" } | Select-Object -First 1
  }
  if (-not $scmHost) {
    throw "Unable to resolve SCM hostname from web app metadata"
  }

  $siteUrl = "https://$publicHost"
  $designerUrl = "$siteUrl/designer"
  $ingestionTesterUrl = "$siteUrl/ingestion-test"

  $appSettings = Invoke-AzJson "az webapp config appsettings list -g $ResourceGroup -n $AppServiceName -o json"
  $apiSetting = $appSettings | Where-Object { $_.name -eq "API_BASE_URL" } | Select-Object -First 1
  if (-not $apiSetting -or [string]$apiSetting.value -ne $ApiBaseUrl) {
    throw "App Service API_BASE_URL is not set to the expected backend URL"
  }

  $envJs = @(
    "window.__APP_CONFIG__ = window.__APP_CONFIG__ || {};",
    "window.__APP_CONFIG__.API_BASE_URL = '$ApiBaseUrl';"
  ) -join "`n"
  Set-Content -Path (Join-Path $distPath "env.js") -Value $envJs -Encoding utf8

  if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
  }
  Compress-Archive -Path (Join-Path $distPath "*") -DestinationPath $zipPath -Force

  $kuduBase = "https://$scmHost"
  $deployUrl = "$kuduBase/api/zipdeploy?isAsync=true"
  $publishingCredentials = Invoke-AzJson "az webapp deployment list-publishing-credentials -g $ResourceGroup -n $AppServiceName -o json"
  $username = [string]$publishingCredentials.publishingUserName
  $password = [string]$publishingCredentials.publishingPassword
  if (-not $username -or -not $password) {
    throw "Publishing credentials were empty"
  }

  $pair = "$username`:$password"
  $bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)
  $basicAuth = [Convert]::ToBase64String($bytes)
  $headers = @{ Authorization = "Basic $basicAuth" }

  $zipBytes = [System.IO.File]::ReadAllBytes($zipPath)
  $deploymentTransport = "kudu_zipdeploy_api"
  $deploymentStatus = $null
  try {
    $deployResponse = Invoke-WebRequest -Method Post -Uri $deployUrl -Headers $headers -ContentType "application/zip" -Body $zipBytes -UseBasicParsing -TimeoutSec 900

    $locationHeader = $deployResponse.Headers["Location"]
    if (-not $locationHeader) {
      $locationHeader = "$kuduBase/api/deployments/latest"
    }
    if ($locationHeader -notmatch "^https?://") {
      $locationHeader = "$kuduBase$locationHeader"
    }

    $maxPoll = 120
    $pollCount = 0
    do {
      $pollCount += 1
      $deploymentStatus = Invoke-RestMethod -Method Get -Uri $locationHeader -Headers $headers -TimeoutSec 120
      if ($deploymentStatus.status -eq 4) {
        break
      }
      if ($deploymentStatus.status -eq 3) {
        throw "ZipDeploy failed: $($deploymentStatus.status_text)"
      }
    } while ($pollCount -lt $maxPoll)

    if (-not $deploymentStatus -or $deploymentStatus.status -ne 4) {
      throw "ZipDeploy did not complete successfully within timeout"
    }
  }
  catch {
    $deploymentTransport = "az_webapp_config_zip_fallback"
    az webapp deployment source config-zip -g $ResourceGroup -n $AppServiceName --src "$zipPath" --output none
    if ($LASTEXITCODE -ne 0) {
      throw "Fallback config-zip deployment failed with exit code $LASTEXITCODE"
    }
    $deploymentStatus = [ordered]@{
      status = 4
      status_text = "Deployment successful via az webapp deployment source config-zip"
      progress = "complete"
      complete = $true
    }
  }

  $wwwrootNames = @()
  try {
    $wwwrootList = Invoke-RestMethod -Method Get -Uri "$kuduBase/api/vfs/site/wwwroot/" -Headers $headers -TimeoutSec 180
    $wwwrootNames = @($wwwrootList | ForEach-Object { $_.name })
  }
  catch {
    $wwwrootNames = @("unavailable_via_kudu_auth")
  }

  az webapp restart -g $ResourceGroup -n $AppServiceName --output none

  $designerCheck = Test-Http -Method "GET" -Url $designerUrl
  $rootCheck = Test-Http -Method "GET" -Url $siteUrl
  $ingestionPageCheck = Test-Http -Method "GET" -Url $ingestionTesterUrl
  $envCheck = Test-Http -Method "GET" -Url "$siteUrl/env.js"

  $assetChecks = @()
  if ($designerCheck.ok -or $rootCheck.ok) {
    $bundlesToCheck = $assetFiles |
      Where-Object { $_.Extension -in @(".js", ".css") } |
      Select-Object -First 6
    foreach ($bundle in $bundlesToCheck) {
      $assetChecks += Test-Http -Method "GET" -Url "$siteUrl/assets/$($bundle.Name)"
    }
  }

  $pdfCandidate = Get-ChildItem -Path (Join-Path $RepoRoot "test-fixtures\pdf") -Filter *.pdf -File -ErrorAction SilentlyContinue | Select-Object -First 1
  $extractResult = $null
  $mapResult = $null
  $wave8Active = $false

  if ($pdfCandidate) {
    try {
      $extractResponsePath = Join-Path $deployRoot "extractDocument-response.json"
      if (Test-Path $extractResponsePath) {
        Remove-Item $extractResponsePath -Force -ErrorAction SilentlyContinue
      }

      $extractStatus = & curl.exe -sS -X POST "$ApiBaseUrl/api/extractdocument" -H "X-File-Name: $($pdfCandidate.Name)" -F "file=@$($pdfCandidate.FullName);type=application/pdf" -o "$extractResponsePath" -w "%{http_code}"
      if ($LASTEXITCODE -ne 0) {
        throw "curl extraction call failed with exit code $LASTEXITCODE"
      }

      $extractStatusCode = [int]$extractStatus
      if (-not (Test-Path $extractResponsePath)) {
        throw "extractDocument response file was not created"
      }

      $extractJson = Get-Content $extractResponsePath -Raw | ConvertFrom-Json
      if ($extractStatusCode -lt 200 -or $extractStatusCode -ge 300) {
        $apiError = if ($extractJson.error) { [string]$extractJson.error } else { "HTTP $extractStatusCode" }
        throw "extractDocument failed: $apiError"
      }

      $wave8Active = [string]$extractJson.extractionMethod -like "*wave8*"
      $extractResult = [ordered]@{
        ok = $true
        status = $extractStatusCode
        extractionMethod = [string]$extractJson.extractionMethod
        blocks = @($extractJson.blocks).Count
        mappings = @($extractJson.mappings).Count
      }

      $blocksForMap = @($extractJson.blocks | Select-Object -First 120)
      $mapBody = [ordered]@{ documentId = "frontend-deploy-validation"; blocks = $blocksForMap }
      $mapCheck = Test-Http -Method "POST" -Url "$ApiBaseUrl/api/mapfields" -Body $mapBody
      $mapResult = $mapCheck
    }
    catch {
      $extractResult = [ordered]@{ ok = $false; error = $_.Exception.Message }
      $mapResult = [ordered]@{ ok = $false; error = "mapFields skipped because extractDocument failed" }
    }
  }
  else {
    $extractResult = [ordered]@{ ok = $false; error = "No PDF fixture found under test-fixtures/pdf" }
    $mapResult = [ordered]@{ ok = $false; error = "mapFields skipped because no PDF fixture was available" }
  }

  $deploymentReport = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    appServiceName = $AppServiceName
    resourceGroup = $ResourceGroup
    appServiceHostName = $publicHost
    deploymentMethod = "Kudu zipdeploy single-shot"
    deploymentEndpoint = "$kuduBase/api/zipdeploy"
    deploymentTransport = $deploymentTransport
    packagePath = $zipPath
    runtime = [ordered]@{
      nodeVersion = [string]$webAppMeta.siteConfig.nodeVersion
      runtimeRequirement = "Node 20+"
      runtimeRequirementSatisfied = ([string]$webAppMeta.siteConfig.nodeVersion -match "^~?(2[0-9]|[3-9][0-9])")
      runtimeConfigMode = "window.__APP_CONFIG__.API_BASE_URL"
      compileTimeViteApiBaseUsed = $false
    }
    buildChecks = [ordered]@{
      indexHtml = (Test-Path (Join-Path $distPath "index.html"))
      runtimeEnvLoader = (Test-Path (Join-Path $distPath "env.js"))
      assetCount = @($assetFiles).Count
      designerAssetsDetected = [bool]$designerAssetHit
      ingestionTesterAssetsDetected = [bool]$ingestionAssetHit
    }
    appSettings = [ordered]@{
      API_BASE_URL = if ($apiSetting) { [string]$apiSetting.value } else { $null }
      matchesExpected = if ($apiSetting) { ([string]$apiSetting.value -eq $ApiBaseUrl) } else { $false }
    }
    zipDeploy = [ordered]@{
      status = $deploymentStatus.status
      statusText = $deploymentStatus.status_text
      progress = $deploymentStatus.progress
      complete = ($deploymentStatus.complete)
    }
    wwwroot = [ordered]@{
      contains_index_html = ($wwwrootNames -contains "index.html")
      contains_env_js = ($wwwrootNames -contains "env.js")
      contains_assets_dir = ($wwwrootNames -contains "assets")
      entries = $wwwrootNames
    }
  }

  $validationReport = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    appServiceName = $AppServiceName
    urls = [ordered]@{
      root = $rootCheck
      designer = $designerCheck
      ingestionTester = $ingestionPageCheck
      envJs = $envCheck
      assets = $assetChecks
    }
    backendConnectivity = [ordered]@{
      apiBaseUrl = $ApiBaseUrl
      extractDocument = $extractResult
      mapFields = $mapResult
      wave8UsabilityModeActive = $wave8Active
    }
  }

  $deploymentReport | ConvertTo-Json -Depth 30 | Set-Content $deploymentReportPath
  $validationReport | ConvertTo-Json -Depth 30 | Set-Content $validationReportPath

  Write-Output "Frontend deployment completed."
  Write-Output "Deployment report: $deploymentReportPath"
  Write-Output "Validation report: $validationReportPath"
}
finally {
  Pop-Location
}
