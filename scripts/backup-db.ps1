# Nightly database backup (run by the "Hardware POS backup" scheduled task).
# Dumps DATABASE_URL from .env with pg_dump, checks the dump can be read,
# keeps the newest $Keep dumps, and copies each new dump to BACKUP_COPY_DIR
# from .env when that is set (a USB drive, network share or Google Drive folder).
# Restore: see docs/server-setup.md
param(
  [string]$Dir = "E:\pos-backups",
  [int]$Keep = 30
)
$ErrorActionPreference = "Stop"
$bin = "C:\Program Files\PostgreSQL\18\bin"
$root = Split-Path $PSScriptRoot
$envLines = Get-Content (Join-Path $root ".env")

function Get-EnvValue([string]$name) {
  foreach ($line in $envLines) {
    if ($line -match "^\s*$name\s*=\s*`"?([^`"]*)`"?\s*$") { return $Matches[1] }
  }
}

function Write-Log([string]$text) {
  "{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $text | Add-Content (Join-Path $Dir "backup.log")
}

function Remove-Old([string]$folder) {
  Get-ChildItem $folder -Filter "hardware_pos-*.dump" | Sort-Object Name -Descending |
    Select-Object -Skip $Keep | Remove-Item -Force
}

New-Item -ItemType Directory -Force $Dir | Out-Null
$url = Get-EnvValue "DATABASE_URL"
if (-not $url) { Write-Log "FAILED: DATABASE_URL missing in .env"; exit 1 }

# Parsed by hand: [Uri] rejects a raw "@" in the password and would echo the
# whole URL (password included) in its error. The greedy password group runs
# to the last "@", so such passwords still work.
if ($url -notmatch '^postgres(?:ql)?://([^:/]+):(.*)@([^@/:]+)(?::(\d+))?/([^?]+)') {
  Write-Log "FAILED: DATABASE_URL is not a postgresql://user:password@host/db URL"
  exit 1
}
$user = $Matches[1]
# Pass the password through the environment so it never shows in a process list.
$env:PGPASSWORD = [Uri]::UnescapeDataString($Matches[2])
$hostName = $Matches[3]
$port = if ($Matches[4]) { $Matches[4] } else { 5432 }
$database = $Matches[5]

$file = Join-Path $Dir ("hardware_pos-{0:yyyy-MM-dd_HHmm}.dump" -f (Get-Date))
& "$bin\pg_dump.exe" --format=custom --host=$hostName --port=$port --username=$user --dbname=$database --file=$file
if ($LASTEXITCODE -ne 0) {
  Remove-Item $file -ErrorAction SilentlyContinue
  Write-Log "FAILED: pg_dump exit code $LASTEXITCODE"
  exit 1
}
# A dump pg_restore cannot list is useless; catch that now rather than on restore day.
& "$bin\pg_restore.exe" --list $file > $null
if ($LASTEXITCODE -ne 0) {
  Write-Log "FAILED: $file is not readable by pg_restore"
  exit 1
}
Remove-Old $Dir
Write-Log ("ok {0} ({1:N0} KB)" -f (Split-Path $file -Leaf), ((Get-Item $file).Length / 1KB))

$copyDir = Get-EnvValue "BACKUP_COPY_DIR"
if ($copyDir) {
  try {
    New-Item -ItemType Directory -Force $copyDir | Out-Null
    Copy-Item $file $copyDir
    Remove-Old $copyDir
    Write-Log "copied to $copyDir"
  } catch {
    # The local dump is safe; a missing USB or offline share must not fail the backup.
    Write-Log "WARNING: copy to $copyDir failed: $($_.Exception.Message)"
  }
}
