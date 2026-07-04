# Capture a specific top-level window to PNG via PrintWindow (works even when
# the window is NOT foreground — unlike a full-desktop screenshot, which grabs
# whatever is on top). Used by the run-desktop skill to verify the app renders.
#
# Usage:
#   powershell -File capture-window.ps1 -Title "Scout Astrolabe" -Out "$env:TEMP\shots_astro.png"
param(
  [string]$Title = "Scout Astrolabe",
  [string]$Out   = "$env:TEMP\shots_astro.png"
)

$sig = @'
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, int nFlags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
if (-not ([System.Management.Automation.PSTypeName]'Win').Type) {
  Add-Type -TypeDefinition $sig -ReferencedAssemblies System.Drawing
}
Add-Type -AssemblyName System.Drawing

$p = Get-Process electron -ErrorAction SilentlyContinue |
     Where-Object { $_.MainWindowTitle -eq $Title } | Select-Object -First 1
if (-not $p) { Write-Output "NO WINDOW titled '$Title'"; exit 1 }

$h = $p.MainWindowHandle
[Win]::ShowWindow($h, 9) | Out-Null      # SW_RESTORE
[Win]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 800

$r = New-Object Win+RECT
[Win]::GetWindowRect($h, [ref]$r) | Out-Null
$w  = $r.Right - $r.Left
$ht = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap($w, $ht)
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$ok  = [Win]::PrintWindow($h, $g.GetHdc(), 2)   # nFlags=2 => PW_RENDERFULLCONTENT
$g.ReleaseHdc()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "SAVED $Out  ${w}x${ht}  PrintWindow=$ok"
