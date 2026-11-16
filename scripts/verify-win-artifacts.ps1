param(
  [string]$DistDir = "dist",
  [string]$PackageJsonPath = "package.json",
  [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

function Resolve-RepoPath {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  if ([System.IO.Path]::IsPathRooted($PathValue)) { return $PathValue }
  return Join-Path (Get-Location).Path $PathValue
}

function Get-SanitizedProductFilename {
  param([Parameter(Mandatory = $true)][string]$RawName)
  $cleaned = ($RawName -replace '[<>:"/\\|?*\x00-\x1f]', '').TrimEnd('.', ' ')
  if ([string]::IsNullOrWhiteSpace($cleaned)) { throw "Sanitized product filename from '$RawName' is empty." }
  return $cleaned
}

function Expand-ArtifactPattern {
  param(
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Arch,
    [Parameter(Mandatory = $true)][string]$Ext,
    [Parameter(Mandatory = $true)][string]$ProductName,
    [Parameter(Mandatory = $true)][string]$PackageName
  )
  $result = $Pattern
  $result = $result.Replace('${version}', $Version)
  $result = $result.Replace('${arch}', $Arch)
  $result = $result.Replace('${ext}', $Ext)
  $result = $result.Replace('${productName}', $ProductName)
  $result = $result.Replace('${name}', $PackageName)
  return $result
}

function Get-TargetArchFromConfig {
  param(
    [Parameter(Mandatory = $true)]$Targets,
    [Parameter(Mandatory = $true)][string]$TargetName
  )
  $matched = $null
  foreach ($entry in @($Targets)) {
    if ($entry -is [string] -and $entry -eq $TargetName) {
      return "x64"
    }
    if ($null -ne $entry -and $entry.target -eq $TargetName) {
      $matched = $entry
      break
    }
  }
  if ($null -eq $matched) {
    throw "Target '$TargetName' not found in package.json build.win.target."
  }
  $archs = @($matched.arch)
  if ($archs.Count -eq 0) {
    throw "Target '$TargetName' in build.win.target does not declare any arch."
  }
  if ($archs -contains "arm64") {
    throw "Target '$TargetName' declares unsupported arch 'arm64' for x64 pipeline."
  }
  if ($archs.Count -ne 1 -or $archs[0] -ne "x64") {
    throw "Target '$TargetName' expected single arch 'x64', got: $($archs -join ', ')"
  }
  return [string]$archs[0]
}

function Assert-PeExecutable {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][int[]]$AllowedMachines,
    [Parameter(Mandatory = $true)][bool]$RequireOverlay
  )

  if (-not (Test-Path -Path $Path -PathType Leaf)) {
    throw "Executable file not found: $Path"
  }

  $fileInfo = Get-Item -Path $Path
  [uint64]$fileLength = [uint64]$fileInfo.Length
  if ($fileLength -eq 0) {
    throw "Executable file is empty (0 bytes): $Path"
  }
  if ($fileLength -lt 64) {
    throw "Executable file is shorter than DOS header (64 bytes): $Path ($fileLength bytes)"
  }

  $stream = $null
  $reader = $null
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    $reader = New-Object System.IO.BinaryReader($stream)

    $mz = $reader.ReadUInt16()
    if ($mz -ne 0x5A4D) {
      throw "Invalid DOS 'MZ' signature (0x$($mz.ToString('X4'))) in $Path"
    }

    $stream.Position = 0x3C
    [uint64]$eLfanew = [uint64]$reader.ReadUInt32()
    if ($eLfanew -lt 64 -or ($eLfanew + 24) -gt $fileLength) {
      throw "Invalid e_lfanew offset ($eLfanew) for file length ($fileLength) in $Path"
    }

    $stream.Position = [int64]$eLfanew
    $peSig = $reader.ReadUInt32()
    if ($peSig -ne 0x00004550) {
      throw "Invalid PE signature (0x$($peSig.ToString('X8'))) in $Path"
    }

    [int]$machine = [int]$reader.ReadUInt16()
    if ($machine -eq 0xAA64) {
      throw "ARM64 PE architecture (0xAA64) is rejected for current x64 build: $Path"
    }
    if ($AllowedMachines -notcontains $machine) {
      $allowedHex = ($AllowedMachines | ForEach-Object { "0x$($_.ToString('X4'))" }) -join ", "
      throw "Disallowed PE Machine 0x$($machine.ToString('X4')) in $Path (allowed: $allowedHex)"
    }

    [uint64]$numSections = [uint64]$reader.ReadUInt16()
    if ($numSections -lt 1 -or $numSections -gt 96) {
      throw "Invalid NumberOfSections ($numSections) in $Path"
    }

    $stream.Position = [int64]($eLfanew + 20)
    [uint64]$sizeOfOptionalHeader = [uint64]$reader.ReadUInt16()
    [int]$characteristics = [int]$reader.ReadUInt16()

    if (($characteristics -band 0x0002) -eq 0) {
      throw "PE file lacks IMAGE_FILE_EXECUTABLE_IMAGE (0x0002): $Path"
    }
    if (($characteristics -band 0x2000) -ne 0) {
      throw "PE file is marked as DLL (IMAGE_FILE_DLL 0x2000), expected EXE: $Path"
    }

    [uint64]$optHeaderOffset = $eLfanew + 24
    [uint64]$sectionTableOffset = $optHeaderOffset + $sizeOfOptionalHeader
    if (($sectionTableOffset + ($numSections * 40)) -gt $fileLength) {
      throw "Optional header or section table exceeds file bounds in $Path"
    }

    $stream.Position = [int64]$optHeaderOffset
    [int]$optMagic = [int]$reader.ReadUInt16()
    if ($optMagic -eq 0x010B) {
      if ($sizeOfOptionalHeader -lt 96) {
        throw "PE32 OptionalHeader smaller than 96 bytes ($sizeOfOptionalHeader) in $Path"
      }
    } elseif ($optMagic -eq 0x020B) {
      if ($sizeOfOptionalHeader -lt 112) {
        throw "PE32+ OptionalHeader smaller than 112 bytes ($sizeOfOptionalHeader) in $Path"
      }
    } else {
      throw "Unknown OptionalHeader Magic 0x$($optMagic.ToString('X4')) in $Path"
    }

    [uint64]$maxSectionEnd = 0
    for ([uint64]$i = 0; $i -lt $numSections; $i++) {
      [uint64]$secOffset = $sectionTableOffset + ($i * 40)
      $stream.Position = [int64]($secOffset + 16)
      [uint64]$sizeOfRawData = [uint64]$reader.ReadUInt32()
      [uint64]$pointerToRawData = [uint64]$reader.ReadUInt32()

      if ($sizeOfRawData -gt 0) {
        [uint64]$secEnd = $pointerToRawData + $sizeOfRawData
        if ($secEnd -gt $fileLength) {
          throw "Truncated PE section #$i (end=$secEnd > fileLength=$fileLength) in $Path"
        }
        if ($secEnd -gt $maxSectionEnd) {
          $maxSectionEnd = $secEnd
        }
      }
    }

    if ($maxSectionEnd -eq 0) {
      throw "PE executable has no raw section payload ($maxSectionEnd bytes) in $Path"
    }

    [uint64]$overlayBytes = $fileLength - $maxSectionEnd
    if ($RequireOverlay -and $overlayBytes -eq 0) {
      throw "Expected non-empty PE overlay payload after section end ($maxSectionEnd), got 0 bytes in $Path"
    }

    return [PSCustomObject]@{
      Path          = $Path
      Length        = $fileLength
      MachineHex    = "0x$($machine.ToString('X4'))"
      OptionalMagic = "0x$($optMagic.ToString('X4'))"
      Sections      = $numSections
      MaxSectionEnd = $maxSectionEnd
      OverlayBytes  = $overlayBytes
    }
  } finally {
    if ($null -ne $reader) { $reader.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
  }
}

function New-SyntheticPeBytes {
  param(
    [int]$Machine = 0x8664,
    [int]$OptMagic = 0x020B,
    [int]$Characteristics = 0x0002,
    [int]$OverlayBytes = 64
  )
  [int]$optSize = if ($OptMagic -eq 0x020B) { 240 } else { 224 }
  [int]$eLfanew = 64
  [int]$ptrRaw = 512
  [int]$rawSize = 512
  [int]$totalLen = $ptrRaw + $rawSize + $OverlayBytes
  $buf = New-Object byte[] $totalLen

  # DOS header
  $buf[0] = 0x4D; $buf[1] = 0x5A
  [BitConverter]::GetBytes([uint32]$eLfanew).CopyTo($buf, 0x3C)

  # PE\0\0
  $buf[$eLfanew] = 0x50; $buf[$eLfanew + 1] = 0x45
  $buf[$eLfanew + 2] = 0x00; $buf[$eLfanew + 3] = 0x00

  # COFF
  [BitConverter]::GetBytes([uint16]$Machine).CopyTo($buf, $eLfanew + 4)
  [BitConverter]::GetBytes([uint16]1).CopyTo($buf, $eLfanew + 6)
  [BitConverter]::GetBytes([uint16]$optSize).CopyTo($buf, $eLfanew + 20)
  [BitConverter]::GetBytes([uint16]$Characteristics).CopyTo($buf, $eLfanew + 22)

  # Optional header magic
  [BitConverter]::GetBytes([uint16]$OptMagic).CopyTo($buf, $eLfanew + 24)

  # Section #0
  [int]$secOffset = $eLfanew + 24 + $optSize
  [System.Text.Encoding]::ASCII.GetBytes(".text").CopyTo($buf, $secOffset)
  [BitConverter]::GetBytes([uint32]$rawSize).CopyTo($buf, $secOffset + 16)
  [BitConverter]::GetBytes([uint32]$ptrRaw).CopyTo($buf, $secOffset + 20)

  return $buf
}

function Invoke-SelfTests {
  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("arc-pe-selftest-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  try {
    $writeCase = {
      param([string]$Name, [byte[]]$Bytes)
      $p = Join-Path $tempDir $Name
      [System.IO.File]::WriteAllBytes($p, $Bytes)
      return $p
    }
    $expectFail = {
      param([string]$Label, [scriptblock]$Action)
      $failed = $false
      try { & $Action | Out-Null } catch {
        $failed = $true
        Write-Host "[SelfTest PASS - rejected] $Label -> $($_.Exception.Message)"
      }
      if (-not $failed) { throw "SelfTest FAILED: '$Label' was expected to fail but succeeded." }
    }

    # Positive cases
    $okX86Overlay = & $writeCase "ok-x86-overlay.exe" (New-SyntheticPeBytes -Machine 0x014C -OptMagic 0x010B -OverlayBytes 64)
    $r1 = Assert-PeExecutable -Path $okX86Overlay -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true
    if ($r1.MachineHex -ne "0x014C" -or $r1.OverlayBytes -ne 64) { throw "Unexpected positive x86 result." }

    $okX64Overlay = & $writeCase "ok-x64-overlay.exe" (New-SyntheticPeBytes -Machine 0x8664 -OptMagic 0x020B -OverlayBytes 128)
    $r2 = Assert-PeExecutable -Path $okX64Overlay -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true
    if ($r2.MachineHex -ne "0x8664" -or $r2.OverlayBytes -ne 128) { throw "Unexpected positive x64 overlay result." }

    $okX64NoOverlay = & $writeCase "ok-x64-main.exe" (New-SyntheticPeBytes -Machine 0x8664 -OptMagic 0x020B -OverlayBytes 0)
    $r3 = Assert-PeExecutable -Path $okX64NoOverlay -AllowedMachines @(0x8664) -RequireOverlay $false
    if ($r3.MachineHex -ne "0x8664" -or $r3.OverlayBytes -ne 0) { throw "Unexpected positive x64 main result." }
    Write-Host "[SelfTest PASS] All 3 valid PE cases accepted."

    # Negative cases
    $emptyFile = & $writeCase "empty.exe" ([byte[]]@())
    & $expectFail "Zero-byte file" { Assert-PeExecutable -Path $emptyFile -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true }

    $badMzBytes = New-SyntheticPeBytes -Machine 0x8664 -OptMagic 0x020B -OverlayBytes 64; $badMzBytes[0] = 0x00
    & $expectFail "Corrupted MZ signature" { Assert-PeExecutable -Path (& $writeCase "bad-mz.exe" $badMzBytes) -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true }

    $badPeBytes = New-SyntheticPeBytes -Machine 0x8664 -OptMagic 0x020B -OverlayBytes 64; $badPeBytes[64] = 0x00
    & $expectFail "Corrupted PE signature" { Assert-PeExecutable -Path (& $writeCase "bad-pe.exe" $badPeBytes) -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true }

    $badLfanewBytes = New-SyntheticPeBytes -Machine 0x8664 -OptMagic 0x020B -OverlayBytes 64; [BitConverter]::GetBytes([uint32]16).CopyTo($badLfanewBytes, 0x3C)
    & $expectFail "Invalid e_lfanew (<64)" { Assert-PeExecutable -Path (& $writeCase "bad-lfanew.exe" $badLfanewBytes) -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true }

    $oobLfanewBytes = New-SyntheticPeBytes -Machine 0x8664 -OptMagic 0x020B -OverlayBytes 64; [BitConverter]::GetBytes([uint32]999999).CopyTo($oobLfanewBytes, 0x3C)
    & $expectFail "Out-of-bounds e_lfanew" { Assert-PeExecutable -Path (& $writeCase "oob-lfanew.exe" $oobLfanewBytes) -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true }

    $fullBytes = New-SyntheticPeBytes -Machine 0x8664 -OptMagic 0x020B -OverlayBytes 0
    [byte[]]$truncBytes = [byte[]]($fullBytes[0..799])
    & $expectFail "Truncated PE section" { Assert-PeExecutable -Path (& $writeCase "truncated-section.exe" $truncBytes) -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $false }

    $dllFile = & $writeCase "not-exe.dll.exe" (New-SyntheticPeBytes -Machine 0x8664 -OptMagic 0x020B -Characteristics 0x2002 -OverlayBytes 64)
    & $expectFail "DLL instead of EXE" { Assert-PeExecutable -Path $dllFile -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true }

    $arm64File = & $writeCase "arm64.exe" (New-SyntheticPeBytes -Machine 0xAA64 -OptMagic 0x020B -OverlayBytes 64)
    & $expectFail "ARM64 architecture rejected" { Assert-PeExecutable -Path $arm64File -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true }

    & $expectFail "x86 rejected for main app EXE" { Assert-PeExecutable -Path $okX86Overlay -AllowedMachines @(0x8664) -RequireOverlay $false }
    & $expectFail "Missing PE overlay rejected when required" { Assert-PeExecutable -Path $okX64NoOverlay -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true }

    Write-Host "All PE verifier self-tests PASSED (3 positive, 10 negative)."
  } finally {
    if (Test-Path -Path $tempDir) { Remove-Item -Path $tempDir -Recurse -Force }
  }
}

if ($SelfTest) {
  Invoke-SelfTests
  exit 0
}

$absPkgPath = Resolve-RepoPath -PathValue $PackageJsonPath
$absDistDir = Resolve-RepoPath -PathValue $DistDir

if (-not (Test-Path -Path $absPkgPath -PathType Leaf)) {
  throw "package.json not found at $absPkgPath"
}

$pkg = Get-Content -Path $absPkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$pkg.version
$packageName = [string]$pkg.name
$productName = [string]$pkg.build.productName
$rawExeName = if ($null -ne $pkg.build.executableName -and -not [string]::IsNullOrWhiteSpace([string]$pkg.build.executableName)) {
  [string]$pkg.build.executableName
} else {
  $productName
}
$mainExeName = (Get-SanitizedProductFilename -RawName $rawExeName) + ".exe"

if ([string]::IsNullOrWhiteSpace($version) -or [string]::IsNullOrWhiteSpace($productName)) {
  throw "Missing version or build.productName in $absPkgPath"
}

$nsisArch = Get-TargetArchFromConfig -Targets $pkg.build.win.target -TargetName "nsis"
$portableArch = Get-TargetArchFromConfig -Targets $pkg.build.win.target -TargetName "portable"

$nsisPattern = [string]$pkg.build.nsis.artifactName
$portablePattern = [string]$pkg.build.portable.artifactName
if ([string]::IsNullOrWhiteSpace($nsisPattern) -or [string]::IsNullOrWhiteSpace($portablePattern)) {
  throw "Both build.nsis.artifactName and build.portable.artifactName must be configured in $absPkgPath"
}

$nsisName = Expand-ArtifactPattern -Pattern $nsisPattern -Version $version -Arch $nsisArch -Ext "exe" -ProductName $productName -PackageName $packageName
$portableName = Expand-ArtifactPattern -Pattern $portablePattern -Version $version -Arch $portableArch -Ext "exe" -ProductName $productName -PackageName $packageName
$nsisBlockmapName = "$nsisName.blockmap"

$nsisPath = Join-Path $absDistDir $nsisName
$portablePath = Join-Path $absDistDir $portableName
$nsisBlockmapPath = Join-Path $absDistDir $nsisBlockmapName
$mainExePath = Join-Path (Join-Path $absDistDir "win-unpacked") $mainExeName

if (-not (Test-Path -Path $nsisBlockmapPath -PathType Leaf)) {
  throw "Expected NSIS blockmap not found: $nsisBlockmapPath"
}
$blockmapLength = (Get-Item -Path $nsisBlockmapPath).Length
if ($blockmapLength -le 0) {
  throw "NSIS blockmap is empty (0 bytes): $nsisBlockmapPath"
}

$nsisPe = Assert-PeExecutable -Path $nsisPath -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true
$portablePe = Assert-PeExecutable -Path $portablePath -AllowedMachines @(0x014C, 0x8664) -RequireOverlay $true
$mainPe = Assert-PeExecutable -Path $mainExePath -AllowedMachines @(0x8664) -RequireOverlay $false

$nsisHash = (Get-FileHash -Path $nsisPath -Algorithm SHA256).Hash.ToLowerInvariant()
$portableHash = (Get-FileHash -Path $portablePath -Algorithm SHA256).Hash.ToLowerInvariant()

if ($nsisHash -eq $portableHash) {
  throw "NSIS and Portable artifacts have identical SHA-256 ($nsisHash); target collision detected."
}

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$sumsPath = Join-Path $absDistDir "SHA256SUMS.txt"
$sumLines = @("$nsisHash  $nsisName", "$portableHash  $portableName")
[System.IO.File]::WriteAllText($sumsPath, ($sumLines -join "`n") + "`n", $utf8NoBom)

Write-Host "=== Windows Artifact Verification Summary ==="
Write-Host ("NSIS     : {0} | Size: {1} bytes ({2:N2} MB) | Machine: {3} | Sections: {4} | Overlay: {5} bytes | SHA256: {6}" -f $nsisName, $nsisPe.Length, ($nsisPe.Length / 1MB), $nsisPe.MachineHex, $nsisPe.Sections, $nsisPe.OverlayBytes, $nsisHash)
Write-Host ("Portable : {0} | Size: {1} bytes ({2:N2} MB) | Machine: {3} | Sections: {4} | Overlay: {5} bytes | SHA256: {6}" -f $portableName, $portablePe.Length, ($portablePe.Length / 1MB), $portablePe.MachineHex, $portablePe.Sections, $portablePe.OverlayBytes, $portableHash)
Write-Host ("Main EXE : win-unpacked/{0} | Size: {1} bytes ({2:N2} MB) | Machine: {3} | Sections: {4}" -f $mainExeName, $mainPe.Length, ($mainPe.Length / 1MB), $mainPe.MachineHex, $mainPe.Sections)
Write-Host ("Blockmap : {0} | Size: {1} bytes" -f $nsisBlockmapName, $blockmapLength)
Write-Host "Verified guarantees: (1) PE headers and section bounds are valid; (2) NSIS and Portable carry non-empty PE overlays; (3) SHA-256 digests are distinct."
Write-Host "Note: Structural PE + overlay validation does not verify compressed internal payload execution; runtime launch is covered by Windows QA (S0-05)."

if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_OUTPUT)) {
  $normalizedDist = $DistDir.Replace('\', '/').TrimEnd('/')
  $ghPayload = @(
    "nsis_path=$normalizedDist/$nsisName",
    "portable_path=$normalizedDist/$portableName",
    "nsis_blockmap_path=$normalizedDist/$nsisBlockmapName"
  ) -join "`n"
  [System.IO.File]::AppendAllText($env:GITHUB_OUTPUT, $ghPayload + "`n", $utf8NoBom)
}
