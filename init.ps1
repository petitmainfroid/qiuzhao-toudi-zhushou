param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node.js 22 or newer and rerun this script."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required and was not found on PATH."
}

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
  throw "Node.js 22 or newer is required. Found $(node --version)."
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "package.json"))) {
  throw "package.json is missing. Restore the repository scaffold before running setup."
}

if (-not $SkipInstall) {
  if (Test-Path -LiteralPath (Join-Path $projectRoot "package-lock.json")) {
    npm ci
  }
  else {
    npm install
  }
}

npm run validate
