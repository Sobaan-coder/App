# Makes KHOKHAR start by itself every time you sign in to Windows:
# server in the background + the KHOKHAR window listening for "KHOKHAR, ...".
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1              (install)
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -Browser edge
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -ServerOnly  (no window)
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -Uninstall
param(
  [ValidateSet("auto", "chrome", "edge")] [string]$Browser = "auto",
  [int]$DelaySeconds = 20,
  [switch]$ServerOnly,
  [switch]$Minimized,
  [switch]$Uninstall
)
$ErrorActionPreference = "Stop"
$taskName = "KHOKHAR AI Command Center"

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Autostart removed. KHOKHAR will no longer start when you sign in."
  return
}

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$launcher = Join-Path $root "scripts\windows\khokhar.ps1"
$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`" -Browser $Browser"
if ($ServerOnly) { $arguments += " -ServerOnly" }
if ($Minimized) { $arguments += " -Minimized" }

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$trigger.Delay = "PT{0}S" -f $DelaySeconds   # give Wi-Fi, PostgreSQL and the desktop a moment
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Starts KHOKHAR (AI Command Center) when you sign in" -Force | Out-Null

Write-Host "Done. KHOKHAR will start $DelaySeconds seconds after you sign in to Windows."
Write-Host "Start it right now with:  Start-ScheduledTask -TaskName '$taskName'"
Write-Host "Remove autostart with:   powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -Uninstall"
