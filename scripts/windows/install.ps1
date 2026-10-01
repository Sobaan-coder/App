# One-shot KHOKHAR installer for Windows 10/11. Run it from the project folder:
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1
#
# What it does (each step is skipped when already done, so it is safe to run again):
#   1. installs Node.js LTS and PostgreSQL with winget (free)
#   2. npm install, creates .env with fresh secrets, creates the database tables
#   3. builds the app
#   4. optional: free local AI (Ollama + qwen2.5) so KHOKHAR can answer open questions in Urdu & English
#   5. autostart at sign-in, "KHOKHAR" shortcuts on the Desktop and Start menu
#   6. starts KHOKHAR
#
# Options:
#   -DbPassword <pw>   password for the local PostgreSQL "postgres" user (asked if missing)
#   -DbUrl <url>       use Supabase / another database instead of a local PostgreSQL
#   -WithAI            also install Ollama + a free local model (needs ~5 GB disk, 8 GB+ RAM)
#   -AIModel <name>    model for -WithAI (default qwen2.5:7b; use qwen2.5:3b on 8 GB RAM laptops)
#   -Browser chrome|edge|auto
#   -NoAutostart  -NoShortcuts  -NoStart  -KeepAwake (never sleep while plugged in)
param(
  [string]$DbPassword,
  [string]$DbUrl,
  [switch]$WithAI,
  [string]$AIModel = "qwen2.5:7b",
  [ValidateSet("auto", "chrome", "edge")] [string]$Browser = "auto",
  [switch]$NoAutostart,
  [switch]$NoShortcuts,
  [switch]$NoStart,
  [switch]$KeepAwake
)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
Set-Location $root

function Step([string]$text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Ok([string]$text) { Write-Host "    OK  $text" -ForegroundColor Green }
function Warn([string]$text) { Write-Host "    !   $text" -ForegroundColor Yellow }
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }
function Has([string]$cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Run([string]$exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "'$exe $($arguments -join ' ')' failed (exit code $LASTEXITCODE)" }
}
function Set-EnvValue([string]$key, [string]$value) {
  $file = Join-Path $root ".env"
  $lines = @(Get-Content $file)
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$key\s*=") { $lines[$i] = "$key=$value"; $found = $true }
  }
  if (-not $found) { $lines += "$key=$value" }
  [IO.File]::WriteAllLines($file, $lines)   # UTF-8 without BOM
}

Write-Host ""
Write-Host "  KHOKHAR - AI Command Center - Windows installer" -ForegroundColor Magenta
Write-Host "  Folder: $root"

# Files downloaded as a ZIP are marked "from the internet"; unblock our own scripts.
Get-ChildItem -Path (Join-Path $root "scripts") -Recurse -Include *.ps1, *.bat | Unblock-File -ErrorAction SilentlyContinue

# ---- 1. Prerequisites ----
Step "Checking winget (Windows Package Manager)"
if (-not (Has "winget")) {
  throw "winget is missing. Install 'App Installer' from the Microsoft Store (free), then run this again."
}
Ok "winget found"

Step "Node.js"
Refresh-Path
if (Has "node") {
  $major = [int]((& node -v).TrimStart("v").Split(".")[0])
  if ($major -lt 20) { Warn "Node.js $major is too old - installing the LTS version"; Run "winget" @("install", "--id", "OpenJS.NodeJS.LTS", "-e", "--accept-source-agreements", "--accept-package-agreements") }
  else { Ok ("Node.js " + (& node -v)) }
} else {
  Run "winget" @("install", "--id", "OpenJS.NodeJS.LTS", "-e", "--accept-source-agreements", "--accept-package-agreements")
  Refresh-Path
  if (-not (Has "node")) { throw "Node.js was installed but is not on PATH yet. Close this window, open a new one and run the installer again." }
  Ok ("Node.js " + (& node -v))
}

if (-not $DbUrl) {
  Step "PostgreSQL (database)"
  $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pgService) {
    Ok "PostgreSQL service found: $($pgService.Name) ($($pgService.Status))"
    if ($pgService.Status -ne "Running") {
      try { Start-Service $pgService.Name; Ok "started" } catch { Warn "Could not start it - open 'Services', find $($pgService.Name) and click Start." }
    }
    if (-not $DbPassword) { $DbPassword = Read-Host "    Password of the PostgreSQL 'postgres' user (the one you chose when installing it)" }
  } else {
    if (-not $DbPassword) {
      Write-Host "    Choose a password for the database (write it down; letters and numbers only is simplest)."
      $DbPassword = Read-Host "    New PostgreSQL password"
      if (-not $DbPassword) { $DbPassword = "postgres" }
    }
    Write-Host "    Installing PostgreSQL 17 - this takes a few minutes and may ask for administrator permission..."
    & winget install --id PostgreSQL.PostgreSQL.17 -e --accept-source-agreements --accept-package-agreements `
      --override "--mode unattended --unattendedmodeui minimal --superpassword `"$DbPassword`" --serverport 5432"
    Start-Sleep -Seconds 5
    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $pgService) {
      throw "PostgreSQL did not install. Install it by hand from https://www.postgresql.org/download/windows/ (remember the password), then run: scripts\windows\install.bat -DbPassword YOURPASSWORD"
    }
    Ok "PostgreSQL installed ($($pgService.Name))"
  }
}

# ---- 2. App ----
Step "Installing app packages (npm install - a few minutes the first time)"
if (Test-Path (Join-Path $root "package-lock.json")) { Run "npm" @("ci", "--no-audit", "--no-fund") } else { Run "npm" @("install", "--no-audit", "--no-fund") }
Ok "packages installed"

Step "Creating your settings file (.env)"
if (Test-Path (Join-Path $root ".env")) {
  Ok ".env already exists - keeping it"
  if ($DbUrl) { Set-EnvValue "DATABASE_URL" $DbUrl; Set-EnvValue "DATABASE_SSL" "require" }
  elseif ($DbPassword) { Set-EnvValue "DATABASE_URL" ("postgres://postgres:{0}@localhost:5432/command_center" -f [Uri]::EscapeDataString($DbPassword)) }
} else {
  if ($DbUrl) { Run "npm" @("run", "setup", "--", "--yes", "--db-url=$DbUrl") }
  else { Run "npm" @("run", "setup", "--", "--yes", "--db-password=$DbPassword") }
}
Set-EnvValue "SESSION_DAYS" "365"   # stay signed in on this PC (the app only listens on localhost)
Ok ".env ready"

Step "Checking everything and creating the database"
& npm run doctor
Run "npm" @("run", "db:migrate")
Ok "database tables created"

Step "Browser automation engine (Playwright Chromium, optional)"
& npx playwright install chromium
if ($LASTEXITCODE -ne 0) { Warn "skipped - web page automation will be unavailable until you run: npx playwright install chromium" } else { Ok "installed" }

if ($WithAI) {
  Step "Free local AI (Ollama + $AIModel)"
  Refresh-Path
  if (-not (Has "ollama")) {
    Run "winget" @("install", "--id", "Ollama.Ollama", "-e", "--accept-source-agreements", "--accept-package-agreements")
    Refresh-Path
    Start-Sleep -Seconds 5
  }
  if (Has "ollama") {
    Write-Host "    Downloading $AIModel (several GB, one time)..."
    & ollama pull $AIModel
    if ($LASTEXITCODE -eq 0) { Set-EnvValue "OLLAMA_MODEL" $AIModel; Ok "AI model ready" } else { Warn "Model download failed - later run: ollama pull $AIModel" }
  } else { Warn "Ollama is installed but not on PATH yet; open a new window and run: ollama pull $AIModel" }
}

Step "Building KHOKHAR (production build)"
Run "npm" @("run", "build")
Ok "built"

# ---- 3. Windows integration ----
if ($KeepAwake) {
  Step "Keeping the PC awake while plugged in"
  & powercfg /change standby-timeout-ac 0
  Ok "sleep on AC power: never (screen can still turn off)"
}

if (-not $NoAutostart) {
  Step "Autostart at sign-in"
  & (Join-Path $PSScriptRoot "install-autostart.ps1") -Browser $Browser
}

if (-not $NoShortcuts) {
  Step "Shortcuts (Desktop + Start menu)"
  $shell = New-Object -ComObject WScript.Shell
  $icon = Join-Path $root "public\khokhar.ico"
  $targets = @(
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "KHOKHAR.lnk"),
    (Join-Path ([Environment]::GetFolderPath("Programs")) "KHOKHAR.lnk")
  )
  foreach ($t in $targets) {
    $lnk = $shell.CreateShortcut($t)
    $lnk.TargetPath = "powershell.exe"
    $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'khokhar.ps1')`" -Browser $Browser"
    $lnk.WorkingDirectory = $root
    if (Test-Path $icon) { $lnk.IconLocation = $icon }
    $lnk.Description = "Talk to KHOKHAR"
    $lnk.Save()
  }
  Ok "KHOKHAR shortcut on the Desktop and in the Start menu"
}

if (-not $NoStart) {
  Step "Starting KHOKHAR"
  & (Join-Path $PSScriptRoot "khokhar.ps1") -Browser $Browser
  Ok "KHOKHAR is running"
}

Write-Host ""
Write-Host "  All done!" -ForegroundColor Green
Write-Host "  First time only, in the KHOKHAR window:"
Write-Host "    1. Create your account (the first account is the admin)."
Write-Host "    2. Click 'Allow' when it asks for the microphone."
Write-Host "    3. Say: 'KHOKHAR, what is your name?'  or  'KHOKHAR, youtube kholo'"
Write-Host "  From now on KHOKHAR starts by itself when you sign in to Windows."
Write-Host "  Logs: $env:LOCALAPPDATA\KHOKHAR\logs"
