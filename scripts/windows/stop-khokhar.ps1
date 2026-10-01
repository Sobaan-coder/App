# Stops KHOKHAR: closes its app window and the background server. (Autostart stays on for next login.)
#   powershell -ExecutionPolicy Bypass -File scripts\windows\stop-khokhar.ps1
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$profileDir = Join-Path $env:LOCALAPPDATA "KHOKHAR\browser"
$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and (
    (($_.Name -eq "chrome.exe" -or $_.Name -eq "msedge.exe") -and $_.CommandLine.Contains($profileDir)) -or
    ($_.Name -eq "node.exe" -and $_.CommandLine.Contains($root)) -or
    ($_.Name -eq "cmd.exe" -and $_.CommandLine.Contains("npm start") -and $_.CommandLine.Contains("KHOKHAR"))
  )
}
if (-not $procs) { Write-Host "KHOKHAR is not running."; return }
foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host ("Stopped KHOKHAR ({0} processes)." -f @($procs).Count)
