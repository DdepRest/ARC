<#
.SYNOPSIS
  S4-02 / S4-03 Windows Release QA Preflight & UserData Snapshot Collector.
.DESCRIPTION
  Captures reproducible Windows machine facts (OS build, hardware baseline, non-admin status,
  profile path Cyrillic/spaces flag, Python/FFmpeg presence, artifact SHA-256) and snapshots
  critical userData files before/after upgrade or uninstall so data preservation is verifiable.
#>
param(
  [ValidateSet("preflight", "snapshot-before", "snapshot-after", "compare-snapshots", "verify-bundle")]
  [string]$Mode = "preflight",
  [string]$ArtifactPath = "",
  [string]$UserDataDir = "",
  [string]$OutputDir = "qa-artifacts/windows-qa",
  [string]$BeforeSnapshotPath = "",
  [string]$AfterSnapshotPath = "",
  [ValidateSet("upgrade", "uninstall")]
  [string]$Scenario = "upgrade",
  [string]$EvidenceDir = "",
  [string]$ExpectedCommit = "",
  [switch]$RequireSigned
)

$ErrorActionPreference = "Stop"

if ($Mode -eq "verify-bundle") {
  if ([string]::IsNullOrWhiteSpace($EvidenceDir)) {
    throw "Mode 'verify-bundle' requires -EvidenceDir pointing to the collected Windows QA evidence folder."
  }
  $absOut = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path (Get-Location).Path $OutputDir }
  New-Item -ItemType Directory -Path $absOut -Force | Out-Null
  $verdictOut = Join-Path $absOut "qa-bundle-verdict.json"
  $validator = Join-Path $PSScriptRoot "verify-windows-qa-bundle.cjs"
  $nodeArgs = @($validator, "--dir", $EvidenceDir, "--out", $verdictOut)
  if (-not [string]::IsNullOrWhiteSpace($ExpectedCommit)) {
    $nodeArgs += @("--expected-commit", $ExpectedCommit)
  }
  if ($RequireSigned) {
    $nodeArgs += "--require-signed"
  }
  & node @nodeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Windows QA evidence bundle validation BLOCKED. See $verdictOut"
  }
  exit 0
}

if ($Mode -eq "compare-snapshots") {
  if ([string]::IsNullOrWhiteSpace($BeforeSnapshotPath) -or [string]::IsNullOrWhiteSpace($AfterSnapshotPath)) {
    throw "Mode 'compare-snapshots' requires -BeforeSnapshotPath and -AfterSnapshotPath."
  }
  $absOut = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path (Get-Location).Path $OutputDir }
  New-Item -ItemType Directory -Path $absOut -Force | Out-Null
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $diffOut = Join-Path $absOut ("qa-diff-{0}-{1}.json" -f $Scenario, $ts)
  $comparator = Join-Path $PSScriptRoot "compare-qa-snapshots.cjs"
  & node $comparator --before $BeforeSnapshotPath --after $AfterSnapshotPath --scenario $Scenario --out $diffOut
  if ($LASTEXITCODE -ne 0) {
    throw "Snapshot preservation check FAILED ($Scenario). See $diffOut"
  }
  exit 0
}

if ($IsLinux -or $IsMacOS) {
  throw "scripts/windows-qa-preflight.ps1 requires Windows for live preflight/snapshot capture."
}

function Get-FileSnapshotEntry {
  param(
    [Parameter(Mandatory = $true)][string]$BaseDir,
    [Parameter(Mandatory = $true)][string]$RelativePath
  )

  $full = Join-Path $BaseDir $RelativePath
  if (-not (Test-Path -Path $full)) {
    return [ordered]@{ path = $RelativePath; exists = $false; type = "missing"; sizeBytes = 0; sha256 = $null }
  }

  $item = Get-Item -Path $full
  if ($item.PSIsContainer) {
    $files = @(Get-ChildItem -Path $full -Recurse -File -ErrorAction SilentlyContinue)
    $totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
    return [ordered]@{
      path      = $RelativePath
      exists    = $true
      type      = "directory"
      fileCount = $files.Count
      sizeBytes = if ($null -ne $totalBytes) { [int64]$totalBytes } else { 0 }
    }
  }

  $hash = (Get-FileHash -Path $full -Algorithm SHA256).Hash.ToLowerInvariant()
  return [ordered]@{
    path      = $RelativePath
    exists    = $true
    type      = "file"
    sizeBytes = [int64]$item.Length
    sha256    = $hash
  }
}

$absOut = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path (Get-Location).Path $OutputDir }
New-Item -ItemType Directory -Path $absOut -Force | Out-Null

if ([string]::IsNullOrWhiteSpace($UserDataDir)) {
  $UserDataDir = Join-Path $env:APPDATA "a.r.c."
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1

$pythonCmd = Get-Command -Name python -ErrorAction SilentlyContinue
$ffmpegCmd = Get-Command -Name ffmpeg -ErrorAction SilentlyContinue
$profilePath = $env:USERPROFILE
$hasSpacesInProfile = $profilePath -match '\s'
$hasNonAsciiProfile = $profilePath -match '[^\x00-\x7F]'

$artifactInfo = $null
if (-not [string]::IsNullOrWhiteSpace($ArtifactPath) -and (Test-Path -Path $ArtifactPath -PathType Leaf)) {
  $sig = Get-AuthenticodeSignature -FilePath $ArtifactPath
  $artifactInfo = [ordered]@{
    file             = (Split-Path -Leaf $ArtifactPath)
    sizeBytes        = (Get-Item -Path $ArtifactPath).Length
    sha256           = (Get-FileHash -Path $ArtifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
    authenticode     = [string]$sig.Status
    signerSubject    = if ($sig.SignerCertificate) { [string]$sig.SignerCertificate.Subject } else { "" }
  }
}

$trackedUserAssets = @(
  "arc.db",
  "arc.db-wal",
  "arc.db-shm",
  "secrets.json",
  "tts-policy.json",
  "config/ai-providers.json",
  "macros",
  "models",
  "tts_dicts",
  "backups",
  "logs"
)

$userDataSnapshot = @()
foreach ($rel in $trackedUserAssets) {
  $userDataSnapshot += Get-FileSnapshotEntry -BaseDir $UserDataDir -RelativePath $rel
}

$payload = [ordered]@{
  capturedAt         = (Get-Date).ToString("o")
  mode               = $Mode
  os                 = [ordered]@{
    caption = $os.Caption
    version = $os.Version
    build   = $os.BuildNumber
    arch    = $os.OSArchitecture
  }
  hardware           = [ordered]@{
    cpu          = if ($cpu) { $cpu.Name } else { "Unknown" }
    logicalCores = [int]$env:NUMBER_OF_PROCESSORS
    totalRamGb   = [math]::Round(($os.TotalVisibleMemorySize / 1MB), 2)
    gpu          = if ($gpu) { $gpu.Name } else { "Unknown" }
  }
  environment        = [ordered]@{
    isAdministrator    = $isAdmin
    hasSpacesInProfile = $hasSpacesInProfile
    hasNonAsciiProfile = $hasNonAsciiProfile
    pythonInstalled    = ($null -ne $pythonCmd)
    ffmpegInstalled    = ($null -ne $ffmpegCmd)
  }
  artifact           = $artifactInfo
  userDataExists     = (Test-Path -Path $UserDataDir)
  userDataSnapshot   = $userDataSnapshot
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $absOut ("qa-{0}-{1}.json" -f $Mode, $ts)
$payload | ConvertTo-Json -Depth 6 | Set-Content -Path $outFile -Encoding UTF8
Write-Host "[Windows QA Preflight] Saved evidence snapshot to $outFile"
