# Helper functions for Windows PE VersionInfo and honest Authenticode verification (S3-12).
# Dot-sourced by scripts/verify-win-artifacts.ps1.

function Get-PeVersionMetadata {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
  return [PSCustomObject]@{
    ProductName     = if ($null -ne $vi.ProductName) { $vi.ProductName.Trim() } else { "" }
    FileDescription = if ($null -ne $vi.FileDescription) { $vi.FileDescription.Trim() } else { "" }
    FileVersion     = if ($null -ne $vi.FileVersion) { $vi.FileVersion.Trim() } else { "" }
    ProductVersion  = if ($null -ne $vi.ProductVersion) { $vi.ProductVersion.Trim() } else { "" }
    LegalCopyright  = if ($null -ne $vi.LegalCopyright) { $vi.LegalCopyright.Trim() } else { "" }
    CompanyName     = if ($null -ne $vi.CompanyName) { $vi.CompanyName.Trim() } else { "" }
  }
}

function Assert-MainExeVersionMetadata {
  param(
    [Parameter(Mandatory = $true)]$VersionInfo,
    [Parameter(Mandatory = $true)][string]$ExpectedProductName,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion,
    [Parameter(Mandatory = $true)][string]$ArtifactLabel
  )

  if ([string]::IsNullOrWhiteSpace($VersionInfo.ProductName)) {
    throw "PE VersionInfo ProductName is empty on $ArtifactLabel"
  }
  if ($VersionInfo.ProductName -notlike "*$ExpectedProductName*") {
    throw "PE VersionInfo ProductName mismatch on ${ArtifactLabel}: expected '$ExpectedProductName', got '$($VersionInfo.ProductName)'"
  }
  $verPrefix = ($ExpectedVersion -split '-')[0]
  $hasMatchingVer = ($VersionInfo.ProductVersion -like "$verPrefix*") -or ($VersionInfo.FileVersion -like "$verPrefix*")
  if (-not $hasMatchingVer) {
    throw "PE VersionInfo version mismatch on ${ArtifactLabel}: expected prefix '$verPrefix', got FileVersion='$($VersionInfo.FileVersion)' ProductVersion='$($VersionInfo.ProductVersion)'"
  }
}

function Resolve-AuthenticodeClassification {
  param(
    [Parameter(Mandatory = $true)][string]$Status,
    [string]$SignerSubject = "",
    [string]$SignerThumbprint = "",
    [string]$TimestampSigner = "",
    [string]$StatusMessage = "",
    [bool]$RequireSigned = $false
  )

  $normalized = if ([string]::IsNullOrWhiteSpace($Status)) { "Unknown" } else { $Status.Trim() }

  if ($normalized -eq "Valid") {
    if ([string]::IsNullOrWhiteSpace($SignerSubject) -or [string]::IsNullOrWhiteSpace($SignerThumbprint)) {
      return [PSCustomObject]@{
        Classification   = "INVALID_OR_UNTRUSTED"
        IsTrustedSigned  = $false
        ShouldFail       = $true
        RawStatus        = $normalized
        SignerSubject    = $SignerSubject
        SignerThumbprint = $SignerThumbprint
        TimestampSigner  = $TimestampSigner
        Reason           = "Authenticode reported Valid without SignerCertificate metadata; refusing to claim signed."
      }
    }

    return [PSCustomObject]@{
      Classification   = "TRUSTED_SIGNED"
      IsTrustedSigned  = $true
      ShouldFail       = $false
      RawStatus        = $normalized
      SignerSubject    = $SignerSubject
      SignerThumbprint = $SignerThumbprint
      TimestampSigner  = $TimestampSigner
      Reason           = "Verified trusted Windows Authenticode signature chain."
    }
  }

  if ($normalized -eq "NotSigned") {
    return [PSCustomObject]@{
      Classification   = "UNSIGNED"
      IsTrustedSigned  = $false
      ShouldFail       = $RequireSigned
      RawStatus        = $normalized
      SignerSubject    = ""
      SignerThumbprint = ""
      TimestampSigner  = ""
      Reason           = if ($RequireSigned) {
        "Artifact is UNSIGNED while -RequireSigned was requested."
      } else {
        "Artifact is UNSIGNED (no Authenticode signature). Do NOT claim this release is signed."
      }
    }
  }

  $detail = if ([string]::IsNullOrWhiteSpace($StatusMessage)) { $normalized } else { "$normalized ($StatusMessage)" }
  return [PSCustomObject]@{
    Classification   = "INVALID_OR_UNTRUSTED"
    IsTrustedSigned  = $false
    ShouldFail       = $true
    RawStatus        = $normalized
    SignerSubject    = $SignerSubject
    SignerThumbprint = $SignerThumbprint
    TimestampSigner  = $TimestampSigner
    Reason           = "Authenticode verification failed or certificate chain is untrusted: $detail"
  }
}

function Test-ArtifactAuthenticodeSignature {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [bool]$RequireSigned = $false
  )

  if (-not (Get-Command -Name Get-AuthenticodeSignature -ErrorAction SilentlyContinue)) {
    throw "Get-AuthenticodeSignature cmdlet is unavailable in this environment; Windows Authenticode verification cannot be forged."
  }

  $sig = Get-AuthenticodeSignature -FilePath $Path
  $subject = if ($null -ne $sig.SignerCertificate) { [string]$sig.SignerCertificate.Subject } else { "" }
  $thumbprint = if ($null -ne $sig.SignerCertificate) { [string]$sig.SignerCertificate.Thumbprint } else { "" }
  $tsSigner = if ($null -ne $sig.TimeStamperCertificate) { [string]$sig.TimeStamperCertificate.Subject } else { "" }

  $result = Resolve-AuthenticodeClassification `
    -Status ([string]$sig.Status) `
    -SignerSubject $subject `
    -SignerThumbprint $thumbprint `
    -TimestampSigner $tsSigner `
    -StatusMessage ([string]$sig.StatusMessage) `
    -RequireSigned $RequireSigned

  if ($result.ShouldFail) {
    throw "Authenticode policy rejected '$Path': $($result.Reason)"
  }
  return $result
}

function Invoke-SignatureSelfTests {
  $trusted = Resolve-AuthenticodeClassification `
    -Status "Valid" `
    -SignerSubject "CN=DdepRest" `
    -SignerThumbprint "AABBCCDD" `
    -RequireSigned $true
  if ($trusted.Classification -ne "TRUSTED_SIGNED" -or -not $trusted.IsTrustedSigned -or $trusted.ShouldFail) {
    throw "SelfTest FAILED: Valid signature with signer cert must classify as TRUSTED_SIGNED."
  }

  $validNoCert = Resolve-AuthenticodeClassification -Status "Valid" -SignerSubject "" -SignerThumbprint ""
  if ($validNoCert.Classification -ne "INVALID_OR_UNTRUSTED" -or -not $validNoCert.ShouldFail) {
    throw "SelfTest FAILED: Valid status without SignerCertificate must be rejected."
  }

  $unsignedAllowed = Resolve-AuthenticodeClassification -Status "NotSigned" -RequireSigned $false
  if ($unsignedAllowed.Classification -ne "UNSIGNED" -or $unsignedAllowed.IsTrustedSigned -or $unsignedAllowed.ShouldFail) {
    throw "SelfTest FAILED: NotSigned without -RequireSigned must classify honestly as UNSIGNED without failing."
  }

  $unsignedRequired = Resolve-AuthenticodeClassification -Status "NotSigned" -RequireSigned $true
  if ($unsignedRequired.Classification -ne "UNSIGNED" -or -not $unsignedRequired.ShouldFail) {
    throw "SelfTest FAILED: NotSigned with -RequireSigned must fail."
  }

  foreach ($badStatus in @("HashMismatch", "UnknownError", "NotTrusted")) {
    $bad = Resolve-AuthenticodeClassification -Status $badStatus -RequireSigned $false
    if ($bad.Classification -ne "INVALID_OR_UNTRUSTED" -or -not $bad.ShouldFail) {
      throw "SelfTest FAILED: $badStatus must classify as INVALID_OR_UNTRUSTED and fail."
    }
  }

  Write-Host "[SelfTest PASS] All Authenticode signature classification tests PASSED (7 cases)."
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

  $buf[0] = 0x4D; $buf[1] = 0x5A
  [BitConverter]::GetBytes([uint32]$eLfanew).CopyTo($buf, 0x3C)
  $buf[$eLfanew] = 0x50; $buf[$eLfanew + 1] = 0x45
  $buf[$eLfanew + 2] = 0x00; $buf[$eLfanew + 3] = 0x00
  [BitConverter]::GetBytes([uint16]$Machine).CopyTo($buf, $eLfanew + 4)
  [BitConverter]::GetBytes([uint16]1).CopyTo($buf, $eLfanew + 6)
  [BitConverter]::GetBytes([uint16]$optSize).CopyTo($buf, $eLfanew + 20)
  [BitConverter]::GetBytes([uint16]$Characteristics).CopyTo($buf, $eLfanew + 22)
  [BitConverter]::GetBytes([uint16]$OptMagic).CopyTo($buf, $eLfanew + 24)

  [int]$secOffset = $eLfanew + 24 + $optSize
  [System.Text.Encoding]::ASCII.GetBytes(".text").CopyTo($buf, $secOffset)
  [BitConverter]::GetBytes([uint32]$rawSize).CopyTo($buf, $secOffset + 16)
  [BitConverter]::GetBytes([uint32]$ptrRaw).CopyTo($buf, $secOffset + 20)

  return $buf
}
