# KHOKHAR launcher for Windows.
# Starts the server in the background (no window), waits until it is ready, then opens KHOKHAR in its own
# app window with hands-free listening on ("KHOKHAR, ..."). Safe to run twice: it re-uses what is already running.
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\khokhar.ps1                 (Chrome if installed, else Edge)
#   powershell -ExecutionPolicy Bypass -File scripts\windows\khokhar.ps1 -Browser edge
#   powershell -ExecutionPolicy Bypass -File scripts\windows\khokhar.ps1 -ServerOnly     (no window, e.g. for phones)
#
# Logs:            %LOCALAPPDATA%\KHOKHAR\logs\server.log
# Browser profile: %LOCALAPPDATA%\KHOKHAR\browser  (remembers your login and the microphone permission)
param(
  [ValidateSet("auto", "chrome", "edge")] [string]$Browser = "auto",
  [int]$Delay = 0,
  [switch]$ServerOnly,
  [switch]$Minimized
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$home_ = Join-Path $env:LOCALAPPDATA "KHOKHAR"
$logs = Join-Path $home_ "logs"
$profileDir = Join-Path $home_ "browser"
New-Item -ItemType Directory -Force -Path $logs, $profileDir | Out-Null
$log = Join-Path $logs "launcher.log"
function Log([string]$msg) { Add-Content -Path $log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg) }

if ($Delay -gt 0) { Start-Sleep -Seconds $Delay }

# Make sure node/npm are found even when started by the Task Scheduler right after an install.
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

# Port from .env (default 3000)
$port = 3000
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
  $line = Select-String -Path $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
  if ($line) { $port = [int]$line.Matches[0].Groups[1].Value }
}
$base = "http://localhost:$port"

function Test-Up {
  try { $r = Invoke-WebRequest -Uri "$base/api/health/live" -UseBasicParsing -TimeoutSec 3; return ($r.StatusCode -eq 200) } catch { return $false }
}

# 1) Server
if (Test-Up) {
  Log "server already running on $base"
} else {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Log "npm not found - is Node.js installed?"
    throw "Node.js (npm) was not found. Run scripts\windows\install.ps1 first."
  }
  if (-not (Test-Path (Join-Path $root ".next\BUILD_ID"))) {
    Log "no production build found - building (first run only)"
    $buildLog = Join-Path $logs "build.log"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run build >> `"$buildLog`" 2>&1" -WorkingDirectory $root -WindowStyle Hidden -Wait
  }
  Log "starting server in $root"
  $env:PORT = "$port"
  $serverLog = Join-Path $logs "server.log"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm start >> `"$serverLog`" 2>&1" -WorkingDirectory $root -WindowStyle Hidden
  $ready = $false
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Up) { $ready = $true; break }
  }
  if (-not $ready) {
    Log "server did not become ready in 3 minutes - see $serverLog"
    throw "KHOKHAR's server did not start. Open $serverLog to see why (often: PostgreSQL is not running)."
  }
  Log "server ready on $base"
}
if ($ServerOnly) { return }

# 2) Browser window (one only: two windows would fight over the microphone)
$running = Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profileDir) }
if ($running) {
  Log "KHOKHAR window already open"
  return
}

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$exe = $null
if ($Browser -eq "chrome") { $exe = $chrome }
elseif ($Browser -eq "edge") { $exe = $edge }
else { if ($chrome) { $exe = $chrome } else { $exe = $edge } }

$url = "$base/?wake=1"
if (-not $exe) {
  Log "no Chrome/Edge found, opening default browser"
  Start-Process $url
  return
}

$browserArgs = @(
  "--app=$url",
  "--user-data-dir=`"$profileDir`"",
  "--no-first-run",
  "--no-default-browser-check",
  "--autoplay-policy=no-user-gesture-required",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
  "--window-size=480,820"
)
$style = "Normal"
if ($Minimized) { $style = "Minimized" }
Start-Process -FilePath $exe -ArgumentList $browserArgs -WindowStyle $style
Log "opened $exe ($url)"
