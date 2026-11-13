Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;
public class EnumWin {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetParent(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
}
'@

$results = New-Object System.Collections.ArrayList

$callback = [EnumWin+EnumWindowsProc]{
    param([IntPtr]$hWnd, [IntPtr]$lParam)
    if (-not [EnumWin]::IsWindowVisible($hWnd)) { return $true }
    $len = [EnumWin]::GetWindowTextLength($hWnd)
    if ($len -eq 0) { return $true }
    $sb = New-Object System.Text.StringBuilder($len+1)
    [void][EnumWin]::GetWindowText($hWnd, $sb, $sb.Capacity)
    $title = $sb.ToString()
    if (-not $title) { return $true }

    # класс
    $clsLen = 256
    $clsSb = New-Object System.Text.StringBuilder($clsLen)
    [void][EnumWin]::GetClassName($hWnd, $clsSb, $clsSb.Capacity)
    $cls = $clsSb.ToString()

    if ($title -match "A\.R\.C" -or $cls -match "Chrome|Electron|Arc" -or $title -match "ARC" -or $title -match "Gemini") {
        [void]$results.Add([PSCustomObject]@{
            Handle = $hWnd
            Title = $title
            Class = $cls
        })
    }
    return $true
}

[void][EnumWin]::EnumWindows($callback, [IntPtr]::Zero)

Write-Output "=== CANDIDATES ==="
foreach ($r in $results) {
    Write-Output "[$($r.Handle)] Class=$($r.Class) | Title=$($r.Title)"
}
if ($results.Count -eq 0) {
    Write-Output "No A.R.C. candidate found"
}
