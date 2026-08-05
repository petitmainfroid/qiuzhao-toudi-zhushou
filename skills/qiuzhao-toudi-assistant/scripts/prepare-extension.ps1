param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,
  [switch]$Package
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$resolvedRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$requiredFiles = @(
  (Join-Path $resolvedRoot "package.json"),
  (Join-Path $resolvedRoot "public\manifest.json"),
  (Join-Path $resolvedRoot "AGENTS.md")
)

foreach ($requiredFile in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "The selected directory is not an 秋招投递助手 repository: missing $requiredFile"
  }
}

Push-Location -LiteralPath $resolvedRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot "node_modules") -PathType Container)) {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
  }

  if ($Package) {
    & npm run package:release
    if ($LASTEXITCODE -ne 0) { throw "release packaging failed with exit code $LASTEXITCODE" }
    Write-Output "Release archives are ready in $resolvedRoot"
  } else {
    & npm run validate
    if ($LASTEXITCODE -ne 0) { throw "validation failed with exit code $LASTEXITCODE" }
    Write-Output "Load this unpacked extension directory: $(Join-Path $resolvedRoot 'dist')"
  }
} finally {
  Pop-Location
}
