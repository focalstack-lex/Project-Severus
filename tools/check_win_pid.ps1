param([uint32]$TargetPid = 0)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class WinPidFinder {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    public static List<string> FindByPid(uint targetPid) {
        var results = new List<string>();
        EnumWindows((hWnd, lParam) => {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == targetPid) {
                var sb = new StringBuilder(256);
                GetWindowText(hWnd, sb, 256);
                var cls = new StringBuilder(256);
                GetClassName(hWnd, cls, 256);
                RECT r;
                GetWindowRect(hWnd, out r);
                bool vis = IsWindowVisible(hWnd);
                results.Add(
                    "HWnd=" + hWnd +
                    " Class=" + cls.ToString() +
                    " Title='" + sb.ToString() + "'" +
                    " Visible=" + vis +
                    " Rect=(" + r.Left + "," + r.Top + ")->(" + r.Right + "," + r.Bottom + ")" +
                    " [w=" + (r.Right-r.Left) + ", h=" + (r.Bottom-r.Top) + "]"
                );
            }
            return true;
        }, IntPtr.Zero);
        return results;
    }
}
"@

if ($TargetPid -eq 0) {
    $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -like 'severus*secondbrain' -or $_.ProcessName -like 'severus.ai*'
    }
    if ($procs) { $TargetPid = @($procs)[0].Id }
    else { Write-Host "No severus-secondbrain / severus_secondbrain process found"; exit 1 }
}

Write-Host "Scanning windows for PID $TargetPid..."
$results = [WinPidFinder]::FindByPid($TargetPid)
if ($results.Count -eq 0) {
    Write-Host "NO WINDOWS FOUND for PID $TargetPid"
} else {
    foreach ($r in $results) { Write-Host $r }
}
