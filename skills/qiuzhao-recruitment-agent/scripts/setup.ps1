[CmdletBinding()]
param(
  [ValidateSet('Install', 'Status', 'Remove')]
  [string]$Action = 'Install',

  [ValidateSet('Auto', 'Codex', 'Claude', 'All')]
  [string]$Client = 'Auto',

  [string]$ProjectRoot,

  [switch]$Force,
  [switch]$SkipDependencies,
  [switch]$SkipSkillInstall,
  [switch]$SkipHandshake,
  [switch]$RemoveSkill
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$serverName = 'qiuzhao-recruitment-agent'
$skillName = 'qiuzhao-recruitment-agent'
$sourceSkillRoot = Split-Path -Parent $PSScriptRoot
$stateFileName = '.qiuzhao-install.json'

function Resolve-QiuzhaoRoot {
  param([string]$RequestedRoot)

  $candidates = @()
  if ($RequestedRoot) { $candidates += $RequestedRoot }
  $candidates += (Join-Path $sourceSkillRoot '..\..')

  $sourceState = Join-Path $sourceSkillRoot $stateFileName
  if (Test-Path -LiteralPath $sourceState -PathType Leaf) {
    try {
      $state = Get-Content -LiteralPath $sourceState -Raw -Encoding utf8 | ConvertFrom-Json
      if ($state.projectRoot -is [string]) { $candidates += $state.projectRoot }
    } catch {
      throw 'invalid_qiuzhao_install_state'
    }
  }

  foreach ($candidate in $candidates) {
    try { $resolved = (Resolve-Path -LiteralPath $candidate -ErrorAction Stop).Path } catch { continue }
    if (Test-Path -LiteralPath (Join-Path $resolved 'modules\mcp-server\cli.mjs') -PathType Leaf) {
      return $resolved
    }
  }
  throw 'qiuzhao_project_root_not_found'
}

function Resolve-Executable {
  param([string]$Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $command) { return $null }
  return $command.Source
}

function Invoke-External {
  param([string]$Executable, [string[]]$Arguments)
  $previousPreference = $ErrorActionPreference
  try {
    # Windows PowerShell 5 converts native stderr into ErrorRecord objects. Keep
    # those records as diagnostic output instead of turning warnings into throws.
    $ErrorActionPreference = 'Continue'
    $output = @(& $Executable @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  return [pscustomobject]@{ ExitCode = $exitCode; Output = ($output -join "`n") }
}

function Get-RegistrationResult {
  param([string]$Executable)
  return Invoke-External $Executable @('mcp', 'get', $serverName)
}

function Test-ExpectedRegistration {
  param($RegistrationResult, [string]$NodePath, [string]$EntryPath)
  if ($RegistrationResult.ExitCode -ne 0) { return $false }
  $normalized = $RegistrationResult.Output.Replace('"', '').Replace("'", '')
  return $normalized.IndexOf($NodePath, [StringComparison]::OrdinalIgnoreCase) -ge 0 `
    -and $normalized.IndexOf($EntryPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 `
    -and $normalized -match '(?i)(^|\s)serve(\s|$)'
}

function Get-SelectedClients {
  $codex = Resolve-Executable 'codex'
  $claude = Resolve-Executable 'claude'
  $selected = @()
  if ($Client -in @('Auto', 'All', 'Codex') -and $codex) {
    $selected += [pscustomobject]@{ Name = 'Codex'; Executable = $codex }
  } elseif ($Client -eq 'Codex') {
    throw 'codex_cli_not_found'
  }
  if ($Client -in @('Auto', 'All', 'Claude') -and $claude) {
    $selected += [pscustomobject]@{ Name = 'Claude'; Executable = $claude }
  } elseif ($Client -eq 'Claude') {
    throw 'claude_cli_not_found'
  }
  if ($Client -eq 'All' -and (-not $codex -or -not $claude)) { throw 'all_requested_clients_must_be_installed' }
  if ($selected.Count -eq 0) { throw 'no_supported_client_found' }
  return $selected
}

function Get-SkillDestination {
  param([string]$ClientName)
  if ($ClientName -eq 'Codex') {
    $clientConfigRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
    return Join-Path $clientConfigRoot "skills\$skillName"
  }
  $claudeSkills = if ($env:QIUZHAO_CLAUDE_SKILLS_HOME) {
    $env:QIUZHAO_CLAUDE_SKILLS_HOME
  } else {
    Join-Path $env:USERPROFILE '.claude\skills'
  }
  return Join-Path $claudeSkills $skillName
}

function Initialize-ClientConfigRoot {
  param([string]$ClientName)
  if ($ClientName -eq 'Codex') {
    $clientConfigRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
    New-Item -ItemType Directory -Path $clientConfigRoot -Force | Out-Null
    return
  }
  if ($env:CLAUDE_CONFIG_DIR) {
    New-Item -ItemType Directory -Path $env:CLAUDE_CONFIG_DIR -Force | Out-Null
  }
}

function Assert-SkillDestinationSafe {
  param([string]$Destination)
  if (-not (Test-Path -LiteralPath $Destination)) { return }
  $source = (Resolve-Path -LiteralPath $sourceSkillRoot).Path
  $target = (Resolve-Path -LiteralPath $Destination).Path
  if ($source -eq $target) { return }
  if (-not (Test-Path -LiteralPath (Join-Path $target $stateFileName) -PathType Leaf) -and -not $Force) {
    throw "existing_unmanaged_skill_requires_force:$Destination"
  }
}

function Install-SkillCopy {
  param([string]$ClientName, [string]$Destination, [string]$Root)
  if ($SkipSkillInstall) { return $null }
  Assert-SkillDestinationSafe $Destination
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $source = (Resolve-Path -LiteralPath $sourceSkillRoot).Path
  $target = (Resolve-Path -LiteralPath $Destination).Path
  if ($source -ne $target) {
    Copy-Item -Path (Join-Path $sourceSkillRoot '*') -Destination $target -Recurse -Force
  }
  $state = [ordered]@{
    schemaVersion = 1
    projectRoot = $Root
    client = $ClientName
    serverName = $serverName
    installedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
  $state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $target $stateFileName) -Encoding utf8
  return $target
}

function Remove-SkillCopy {
  param([string]$Destination)
  if (-not $RemoveSkill -or -not (Test-Path -LiteralPath $Destination)) { return $false }
  $stateFile = Join-Path $Destination $stateFileName
  if (-not (Test-Path -LiteralPath $stateFile -PathType Leaf) -and -not $Force) {
    throw "refusing_to_remove_unmanaged_skill:$Destination"
  }
  $resolved = (Resolve-Path -LiteralPath $Destination).Path
  $userRoot = (Resolve-Path -LiteralPath $env:USERPROFILE).Path
  if (-not $resolved.StartsWith($userRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'refusing_to_remove_skill_outside_user_profile'
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
  return $true
}

$root = Resolve-QiuzhaoRoot $ProjectRoot
$entry = (Resolve-Path -LiteralPath (Join-Path $root 'modules\mcp-server\cli.mjs')).Path
$node = Resolve-Executable 'node'
if (-not $node) { throw 'node_not_found' }
$nodeVersion = (& $node -p 'process.versions.node').Trim()
if ([version]$nodeVersion -lt [version]'22.0.0') { throw "node_22_or_newer_required:$nodeVersion" }
$clients = @(Get-SelectedClients)

if ($Action -eq 'Install' -and -not $SkipDependencies) {
  $esbuildReady = Test-Path -LiteralPath (Join-Path $root 'node_modules\esbuild\package.json') -PathType Leaf
  $viteReady = Test-Path -LiteralPath (Join-Path $root 'node_modules\.bin\vite.cmd') -PathType Leaf
  if (-not ($esbuildReady -and $viteReady)) {
    $npm = Resolve-Executable 'npm'
    if (-not $npm) { throw 'npm_not_found' }
    $install = Invoke-External $npm @('ci', '--no-audit', '--no-fund', '--prefix', $root)
    if ($install.ExitCode -ne 0) { throw "npm_ci_failed:$($install.Output)" }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $root 'gerenxinxi\profile-host\dist-ui\index.html') -PathType Leaf)) {
    $npm = Resolve-Executable 'npm'
    if (-not $npm) { throw 'npm_not_found' }
    $build = Invoke-External $npm @('run', '--prefix', $root, 'profile:build')
    if ($build.ExitCode -ne 0) { throw "profile_build_failed:$($build.Output)" }
  }
}

$handshake = $null
if ($Action -in @('Install', 'Status') -and -not $SkipHandshake) {
  $verifier = Join-Path $PSScriptRoot 'verify-mcp.mjs'
  $verifyResult = Invoke-External $node @($verifier, $entry)
  if ($verifyResult.ExitCode -ne 0) { throw "mcp_handshake_failed:$($verifyResult.Output)" }
  $handshake = $verifyResult.Output | ConvertFrom-Json
}

$results = @()
foreach ($selectedClient in $clients) {
  Initialize-ClientConfigRoot $selectedClient.Name
  $destination = Get-SkillDestination $selectedClient.Name
  $registrationBefore = Get-RegistrationResult $selectedClient.Executable
  $registeredBefore = $registrationBefore.ExitCode -eq 0
  $expectedBefore = Test-ExpectedRegistration $registrationBefore $node $entry
  $registration = if ($registeredBefore) {
    if ($expectedBefore) { 'already_registered' } else { 'conflict' }
  } else { 'absent' }
  $skillPath = $null
  $skillRemoved = $false

  if ($Action -eq 'Install') {
    Assert-SkillDestinationSafe $destination
    if ($registeredBefore -and -not $expectedBefore -and -not $Force) {
      throw "existing_mcp_registration_requires_force:$($selectedClient.Name.ToLower())"
    }
    if ($registeredBefore -and $Force) {
      $remove = Invoke-External $selectedClient.Executable @('mcp', 'remove', $serverName)
      if ($remove.ExitCode -ne 0) { throw "$($selectedClient.Name.ToLower())_mcp_remove_failed:$($remove.Output)" }
      $registeredBefore = $false
    }
    if (-not $registeredBefore) {
      $arguments = if ($selectedClient.Name -eq 'Codex') {
        @('mcp', 'add', $serverName, '--', $node, $entry, 'serve')
      } else {
        @('mcp', 'add', '--scope', 'user', '--transport', 'stdio', $serverName, '--', $node, $entry, 'serve')
      }
      $add = Invoke-External $selectedClient.Executable $arguments
      if ($add.ExitCode -ne 0) { throw "$($selectedClient.Name.ToLower())_mcp_add_failed:$($add.Output)" }
      $registration = if ($Force) { 'replaced' } else { 'registered' }
    }
    $registrationAfterAdd = Get-RegistrationResult $selectedClient.Executable
    if (-not (Test-ExpectedRegistration $registrationAfterAdd $node $entry)) {
      throw "$($selectedClient.Name.ToLower())_mcp_registration_not_found_after_add"
    }
    $skillPath = Install-SkillCopy $selectedClient.Name $destination $root
  } elseif ($Action -eq 'Remove') {
    if ($registeredBefore -and -not $expectedBefore -and -not $Force) {
      throw "refusing_to_remove_unknown_mcp_registration:$($selectedClient.Name.ToLower())"
    }
    if ($registeredBefore) {
      $remove = Invoke-External $selectedClient.Executable @('mcp', 'remove', $serverName)
      if ($remove.ExitCode -ne 0) { throw "$($selectedClient.Name.ToLower())_mcp_remove_failed:$($remove.Output)" }
      $registration = 'removed'
    }
    $skillRemoved = Remove-SkillCopy $destination
  }

  $registrationAfter = Get-RegistrationResult $selectedClient.Executable

  $results += [ordered]@{
    client = $selectedClient.Name.ToLower()
    registration = $registration
    registered = $registrationAfter.ExitCode -eq 0
    configurationMatches = (Test-ExpectedRegistration $registrationAfter $node $entry)
    skillPath = $skillPath
    skillRemoved = $skillRemoved
  }
}

[ordered]@{
  schemaVersion = 1
  action = $Action.ToLower()
  serverName = $serverName
  projectRoot = $root
  nodeVersion = $nodeVersion
  handshake = $handshake
  clients = $results
  authorizationGranted = $false
  pageWrites = 0
} | ConvertTo-Json -Depth 6
