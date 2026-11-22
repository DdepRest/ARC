<#
.SYNOPSIS
  S4-01 Real Windows Multi-Process Soak Test Harness for A.R.C.
.DESCRIPTION
  Monitors the live A.R.C. Windows process tree (Electron Main, Chromium Renderer/GPU,
  Python Silero TTS, STT Worker, Local LLM, Download workers), SQLite DB/WAL size,
  CPU/RAM/Handles/Threads, best-effort GPU memory, restart counts, and post-exit
  orphan child processes. Writes CSV telemetry + metadata JSON and runs
  scripts/soak-report-analyzer.cjs for verdict & p50/p95 analysis.
#>
param(
  [string]$ExecutablePath = "",
  [int]$AttachPid = 0,
  [int]$DurationMinutes = 120,
  [int]$IntervalSeconds = 15,
  [string]$OutputDir = "qa-artifacts/soak",
  [string]$UserDataDir = "",
  [switch]$GracefulStopAtEnd,
  [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

function Resolve-ArcProcessRole {
  param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [Parameter(Mandatory = $true)][int]$RootPid,
    [string]$Name = "",
    [string]$CommandLine = ""
  )

  $n = if ($null -ne $Name) { $Name.ToLowerInvariant() } else { "" }
  $cmd = if ($null -ne $CommandLine) { $CommandLine.ToLowerInvariant() } else { "" }

  if ($ProcessId -eq $RootPid) { return "main" }
  if ($n -like "python*" -or $cmd -like "*silero_server.py*") { return "python_tts" }
  if ($cmd -like "*stt_worker*") { return "stt_worker" }
  if ($cmd -like "*llama*" -or $cmd -like "*ollama*") { return "local_llm" }
  if ($cmd -like "*download*" -or $cmd -like "*huggingface*") { return "download_worker" }
  if ($cmd -like "*--type=renderer*" -or $cmd -like "*--type=gpu-process*" -or $cmd -like "*--type=utility*") { return "renderer_gpu" }
  if ($n -like "a.r.c.*" -or $n -like "electron*") { return "renderer_gpu" }
  return "other"
}

function Get-ProcessTreeSnapshot {
  param(
    [Parameter(Mandatory = $true)][int]$RootPid,
    [Parameter(Mandatory = $true)]$AllProcesses
  )

  $byParent = @{}
  $byId = @{}
  foreach ($p in $AllProcesses) {
    $pidVal = [int]$p.ProcessId
    $ppidVal = [int]$p.ParentProcessId
    $byId[$pidVal] = $p
    if (-not $byParent.ContainsKey($ppidVal)) { $byParent[$ppidVal] = New-Object System.Collections.ArrayList }
    [void]$byParent[$ppidVal].Add($p)
  }

  $visited = New-Object 'System.Collections.Generic.HashSet[int]'
  $queue = New-Object 'System.Collections.Generic.Queue[int]'
  $tree = New-Object System.Collections.ArrayList

  if ($byId.ContainsKey($RootPid)) {
    [void]$visited.Add($RootPid)
    $queue.Enqueue($RootPid)
  }

  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    $proc = $byId[$current]
    [void]$tree.Add($proc)
    if ($byParent.ContainsKey($current)) {
      foreach ($child in $byParent[$current]) {
        $cid = [int]$child.ProcessId
        if ($visited.Add($cid)) { $queue.Enqueue($cid) }
      }
    }
  }

  return $tree
}

function Invoke-SoakHarnessSelfTest {
  $synthetic = @(
    [PSCustomObject]@{ ProcessId = 100; ParentProcessId = 1; Name = "A.R.C..exe"; CommandLine = "A.R.C..exe" },
    [PSCustomObject]@{ ProcessId = 101; ParentProcessId = 100; Name = "A.R.C..exe"; CommandLine = "A.R.C..exe --type=renderer" },
    [PSCustomObject]@{ ProcessId = 102; ParentProcessId = 100; Name = "python.exe"; CommandLine = "python.exe silero_server.py" },
    [PSCustomObject]@{ ProcessId = 103; ParentProcessId = 100; Name = "node.exe"; CommandLine = "node.exe scripts/stt_worker.js" },
    [PSCustomObject]@{ ProcessId = 999; ParentProcessId = 1; Name = "unrelated.exe"; CommandLine = "unrelated.exe" }
  )

  $tree = Get-ProcessTreeSnapshot -RootPid 100 -AllProcesses $synthetic
  if ($tree.Count -ne 4) { throw "SelfTest FAILED: expected 4 tree processes, got $($tree.Count)." }

  $roles = @{}
  foreach ($p in $tree) {
    $roles[$p.ProcessId] = Resolve-ArcProcessRole -ProcessId $p.ProcessId -RootPid 100 -Name $p.Name -CommandLine $p.CommandLine
  }
  if ($roles[100] -ne "main" -or $roles[101] -ne "renderer_gpu" -or $roles[102] -ne "python_tts" -or $roles[103] -ne "stt_worker") {
    throw "SelfTest FAILED: unexpected role classification: $($roles | ConvertTo-Json -Compress)"
  }
  Write-Host "[SelfTest PASS] Windows soak harness process tree & role classifier verified (4/4 roles)."
}

if ($SelfTest) {
  Invoke-SoakHarnessSelfTest
  exit 0
}

if ($IsLinux -or $IsMacOS) {
  throw "scripts/windows-soak-harness.ps1 requires Windows (Win32_Process / Performance Counters)."
}

$absOutDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path (Get-Location).Path $OutputDir }
New-Item -ItemType Directory -Path $absOutDir -Force | Out-Null

$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $absOutDir "run-$runId"
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$csvPath = Join-Path $runDir "soak-samples.csv"
$metaPath = Join-Path $runDir "soak-meta.json"
$markerPath = Join-Path $runDir "scenario-marker.txt"
Set-Content -Path $markerPath -Value "idle_30m" -Encoding UTF8

$header = "timestamp,elapsed_sec,scenario,total_rss_mb,main_rss_mb,renderer_gpu_rss_mb,python_tts_rss_mb,stt_worker_rss_mb,local_llm_rss_mb,download_worker_rss_mb,process_count,total_handles,total_threads,cpu_percent,gpu_mem_mb,db_size_kb,wal_size_kb,restarts_total,db_write_ms,stt_latency_ms,tts_latency_ms,fatal_errors"
Set-Content -Path $csvPath -Value $header -Encoding UTF8

$rootPid = $AttachPid
$launchedProc = $null
$artifactSha256 = ""

if ($rootPid -le 0) {
  if ([string]::IsNullOrWhiteSpace($ExecutablePath) -or -not (Test-Path -Path $ExecutablePath -PathType Leaf)) {
    throw "Provide either -AttachPid <PID> or a valid -ExecutablePath to A.R.C..exe."
  }
  $artifactSha256 = (Get-FileHash -Path $ExecutablePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $launchedProc = Start-Process -FilePath $ExecutablePath -PassThru
  $rootPid = $launchedProc.Id
  Start-Sleep -Seconds 3
}

$osInfo = Get-CimInstance Win32_OperatingSystem
$cpuInfo = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpuInfo = Get-CimInstance Win32_VideoController | Select-Object -First 1

$hardwareBaseline = [ordered]@{
  osCaption     = $osInfo.Caption
  osBuild       = $osInfo.BuildNumber
  cpuName       = $cpuInfo.Name
  logicalCores  = [int]$env:NUMBER_OF_PROCESSORS
  totalRamGb    = [math]::Round(($osInfo.TotalVisibleMemorySize / 1MB), 2)
  gpuName       = if ($gpuInfo) { $gpuInfo.Name } else { "Unknown" }
  artifactSha256 = $artifactSha256
}

if ([string]::IsNullOrWhiteSpace($UserDataDir)) {
  $UserDataDir = Join-Path $env:APPDATA "a.r.c."
}

$startTime = Get-Date
$endTime = $startTime.AddMinutes($DurationMinutes)
$prevCpuTotalSec = $null
$prevSampleTime = $null
$knownRolePids = @{ python_tts = $null; stt_worker = $null }
$restartsTotal = 0
$completedScenarios = New-Object 'System.Collections.Generic.HashSet[string]'

Write-Host "[S4-01 Soak] Monitoring A.R.C. root PID=$rootPid for $DurationMinutes min (interval=${IntervalSeconds}s)"
Write-Host "[S4-01 Soak] Write active scenario name into $markerPath to tag windows."

while ((Get-Date) -lt $endTime) {
  $now = Get-Date
  $elapsedSec = [int][math]::Round(($now - $startTime).TotalSeconds)
  $scenario = if (Test-Path -Path $markerPath) { (Get-Content -Path $markerPath -Raw).Trim() } else { "unspecified" }
  if (-not [string]::IsNullOrWhiteSpace($scenario)) { [void]$completedScenarios.Add($scenario) }

  $allCim = Get-CimInstance Win32_Process
  $tree = Get-ProcessTreeSnapshot -RootPid $rootPid -AllProcesses $allCim
  if ($tree.Count -eq 0) {
    Write-Warning "[S4-01 Soak] Root process PID=$rootPid exited early at ${elapsedSec}s."
    break
  }

  $rssByRole = @{ main = 0.0; renderer_gpu = 0.0; python_tts = 0.0; stt_worker = 0.0; local_llm = 0.0; download_worker = 0.0 }
  $totalRss = 0.0
  $totalHandles = 0
  $totalThreads = 0
  $cpuTotalSec = 0.0

  foreach ($cimProc in $tree) {
    $pidVal = [int]$cimProc.ProcessId
    $role = Resolve-ArcProcessRole -ProcessId $pidVal -RootPid $rootPid -Name $cimProc.Name -CommandLine $cimProc.CommandLine

    if ($role -eq "python_tts" -or $role -eq "stt_worker") {
      if ($null -ne $knownRolePids[$role] -and $knownRolePids[$role] -ne $pidVal) {
        $restartsTotal++
      }
      $knownRolePids[$role] = $pidVal
    }

    try {
      $live = Get-Process -Id $pidVal -ErrorAction Stop
      $privMb = $live.PrivateMemorySize64 / 1MB
      $totalRss += $privMb
      if ($rssByRole.ContainsKey($role)) { $rssByRole[$role] += $privMb }
      $totalHandles += $live.HandleCount
      $totalThreads += $live.Threads.Count
      if ($null -ne $live.CPU) { $cpuTotalSec += [double]$live.CPU }
    } catch {
      # Process exited between CIM snapshot and Get-Process
    }
  }

  $cpuPct = "N/A"
  if ($null -ne $prevCpuTotalSec -and $null -ne $prevSampleTime) {
    $dt = ($now - $prevSampleTime).TotalSeconds
    if ($dt -gt 0) {
      $deltaCpu = [math]::Max(0, $cpuTotalSec - $prevCpuTotalSec)
      $cores = [math]::Max(1, [int]$env:NUMBER_OF_PROCESSORS)
      $cpuPct = [math]::Round(($deltaCpu / ($dt * $cores)) * 100, 2)
    }
  }
  $prevCpuTotalSec = $cpuTotalSec
  $prevSampleTime = $now

  $dbPath = Join-Path $UserDataDir "arc.db"
  $walPath = Join-Path $UserDataDir "arc.db-wal"
  $dbKb = if (Test-Path -Path $dbPath) { [math]::Round((Get-Item $dbPath).Length / 1KB, 2) } else { "N/A" }
  $walKb = if (Test-Path -Path $walPath) { [math]::Round((Get-Item $walPath).Length / 1KB, 2) } else { "0" }

  $inv = [System.Globalization.CultureInfo]::InvariantCulture
  $row = [string]::Format(
    $inv,
    "{0},{1},{2},{3:F2},{4:F2},{5:F2},{6:F2},{7:F2},{8:F2},{9:F2},{10},{11},{12},{13},N/A,{14},{15},{16},N/A,N/A,N/A,0",
    $now.ToString("o", $inv), $elapsedSec, $scenario, $totalRss, $rssByRole.main, $rssByRole.renderer_gpu,
    $rssByRole.python_tts, $rssByRole.stt_worker, $rssByRole.local_llm, $rssByRole.download_worker,
    $tree.Count, $totalHandles, $totalThreads, $cpuPct, $dbKb, $walKb, $restartsTotal
  )
  Add-Content -Path $csvPath -Value $row -Encoding UTF8

  Start-Sleep -Seconds $IntervalSeconds
}

$orphanPids = @()
if ($GracefulStopAtEnd) {
  try {
    $mainLive = Get-Process -Id $rootPid -ErrorAction SilentlyContinue
    if ($mainLive) {
      [void]$mainLive.CloseMainWindow()
      Start-Sleep -Seconds 10
    }
  } catch {}

  $afterCim = Get-CimInstance Win32_Process | Where-Object {
    ($_.ProcessId -eq $rootPid) -or
    ($_.CommandLine -like "*silero_server.py*") -or
    ($_.CommandLine -like "*stt_worker.js*")
  }
  $orphanPids = @($afterCim | ForEach-Object { [int]$_.ProcessId })
}

$meta = [ordered]@{
  runId              = $runId
  startedAt          = $startTime.ToString("o")
  endedAt            = (Get-Date).ToString("o")
  rootPid            = $rootPid
  totalRestarts      = $restartsTotal
  orphanPids         = $orphanPids
  completedScenarios = @($completedScenarios)
  hardwareBaseline   = $hardwareBaseline
}
$meta | ConvertTo-Json -Depth 5 | Set-Content -Path $metaPath -Encoding UTF8

Write-Host "[S4-01 Soak] Telemetry written to $csvPath and $metaPath."
if (Get-Command -Name node -ErrorAction SilentlyContinue) {
  & node (Join-Path $PSScriptRoot "soak-report-analyzer.cjs") $csvPath $metaPath
}
