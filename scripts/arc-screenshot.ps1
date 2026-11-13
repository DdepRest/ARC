param(
    [string]$SkillPath = "C:\Users\DeepRest\.config\freebuff-desktop\account-skills\a9d1dc113b5f08069b8b2837c66b34f661ce97a6912170d30c84eb62eb2c6058\6f6d0c9b5fd972ca61fe850dd09f31d943dcd60f710a3f31c94314d79c111cd1\screenshot\scripts\take_screenshot.ps1",
    [string]$OutPath = ""
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32 {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
}
'@

function Get-WindowText {
    param([IntPtr]$hWnd)
    $len = [Win32]::GetWindowTextLength($hWnd)
    if ($len -eq 0) { return "" }
    $sb = New-Object System.Text.StringBuilder($len + 1)
    [void][Win32]::GetWindowText($hWnd, $sb, $sb.Capacity)
    return $sb.ToString()
}function Find-ArcWindow {
    Write-Output "=== ALL WINDOWS ===" 
    $procs = Get-Process | Where-Object { $_.MainWindowTitle -ne "" -and $_.MainWindowHandle -ne 0 }
    foreach ($p in $procs) {
        Write-Output "[$($p.Id)] $($p.MainWindowTitle) | exe: $($p.ProcessName)" 
    }
    exit 1
}

function Activate-Window {
    param([IntPtr]$hWnd)
    if ([Win32]::IsIconic($hWnd)) {
        [void][Win32]::ShowWindow($hWnd, 9)  # SW_RESTORE
    }
    Start-Sleep -Milliseconds 100
    [void][Win32]::SetForegroundWindow($hWnd)
    Start-Sleep -Milliseconds 200
}

$target = Find-ArcWindow
if (-not $target) {
    Write-Error "No windows found at all"
    exit 1
}

Write-Output "Found window: [$($target.Id)] $($target.Title)"
Activate-Window -hWnd $target.Handle

# Take screenshot of active window
$args = @("-Mode", "temp")
if ($OutPath) { $args += @("-Path", $OutPath) }
$cmd = "powershell -ExecutionPolicy Bypass -File `"$SkillPath`" " + ($args | ForEach-Object { "`$_" })
$screenshot = powershell -ExecutionPolicy Bypass -File $SkillPath -Mode temp
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output $screenshot
