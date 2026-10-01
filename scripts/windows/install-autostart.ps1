# Starts KHOKHAR automatically when you log in to Windows (minimised window).
# Run once in PowerShell from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1
# Remove later with:  Unregister-ScheduledTask -TaskName "KHOKHAR AI Command Center" -Confirm:$false
$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$bat  = Join-Path $root "scripts\windows\start-khokhar.bat"
$action  = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c start `"KHOKHAR`" /min `"$bat`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "KHOKHAR AI Command Center" -Action $action -Trigger $trigger -Settings $settings -Description "Starts the AI Command Center (KHOKHAR) at login" -Force | Out-Null
Write-Host "Done. KHOKHAR will start every time you log in. Start it now with: Start-ScheduledTask -TaskName 'KHOKHAR AI Command Center'"
