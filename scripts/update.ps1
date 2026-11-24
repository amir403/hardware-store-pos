# Updates the POS on a shop computer to the latest code. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\update.ps1
# Order: backup first, then get the code, install, migrate, build. If the build
# fails, the previous build is put back and the shop keeps running the old version.
# Database migrations cannot be undone this way; that is why the backup comes first.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot
Set-Location $root
$task = "Hardware POS server"

function Step([string]$text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Start-Server {
  Enable-ScheduledTask -TaskName $task | Out-Null
  Start-ScheduledTask -TaskName $task
}
function Fail([string]$text) {
  Write-Host "`nSTOPPED: $text" -ForegroundColor Red
  # Whatever happened, the shop must not be left without its till.
  Start-Server
  exit 1
}
function Invoke-Checked([string]$what, [scriptblock]$command) {
  & $command
  if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE). The old version is still running." }
}

Step "Backup before updating"
# The nightly task already knows the backup folder; run it and wait for its status file.
$started = Get-Date
Start-ScheduledTask -TaskName "Hardware POS backup"
do {
  Start-Sleep -Seconds 3
} while ((Get-ScheduledTask -TaskName "Hardware POS backup").State -eq "Running" -and ((Get-Date) - $started).TotalMinutes -lt 10)
$statusFile = Join-Path $root "logs\backup-status.json"
$status = if (Test-Path $statusFile) { Get-Content $statusFile -Raw | ConvertFrom-Json } else { $null }
if (-not $status -or -not $status.ok -or [datetime]$status.at -lt $started) {
  Write-Host "STOPPED: the backup did not finish, so nothing was changed. See Settings > Backups." -ForegroundColor Red
  exit 1
}
Write-Host "Backup ok: $($status.file)"

Step "Getting the latest code"
if (Test-Path (Join-Path $root ".git")) {
  $dirty = git status --porcelain --untracked-files=no
  if ($dirty) { Write-Host "STOPPED: files in this folder were edited by hand:`n$dirty`nNothing was changed." -ForegroundColor Red; exit 1 }
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED: could not download the update (no internet, or the branch has diverged). Nothing was changed." -ForegroundColor Red; exit 1 }
} else {
  Write-Host "Not a git folder: using the code already copied here."
}

Step "Stopping the POS for a few minutes"
# Disable first: the 5-minute watchdog would otherwise restart it mid-build.
Disable-ScheduledTask -TaskName $task | Out-Null
Stop-ScheduledTask -TaskName $task
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Step "Installing packages and updating the database"
Invoke-Checked "npm ci" { npm.cmd ci --no-audit --no-fund }
Invoke-Checked "prisma generate" { npx.cmd prisma generate }
Invoke-Checked "prisma migrate deploy" { npx.cmd prisma migrate deploy }

Step "Building"
$next = Join-Path $root ".next"
$previous = Join-Path $root ".next-previous"
if (Test-Path $previous) { Remove-Item -Recurse -Force $previous }
if (Test-Path $next) { Move-Item $next $previous }
npm.cmd run build
if ($LASTEXITCODE -ne 0) {
  if (Test-Path $next) { Remove-Item -Recurse -Force $next }
  if (Test-Path $previous) { Move-Item $previous $next }
  Fail "The build failed; the previous version was put back."
}
if (Test-Path $previous) { Remove-Item -Recurse -Force $previous }

Step "Starting the POS"
Start-Server
Write-Host "`nUpdated. The POS is starting; give it a minute, then refresh the browser." -ForegroundColor Green
