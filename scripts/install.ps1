# One-command install on a new shop computer. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# Needs Node.js (20 or newer) and PostgreSQL already installed. Safe to run again:
# it keeps an existing .env and database and only applies what is missing.
# When it finishes, open http://localhost:3000 and the setup screen asks for the
# shop's details and the owner's admin account. No demo data is created.
param(
  [string]$DbName = "hardware_pos",
  [string]$DbUser = "postgres",
  [string]$DbHost = "localhost",
  [int]$DbPort = 5432,
  [string]$BackupTime = "22:00",
  [string]$BackupDir = ""
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot
Set-Location $root

function Step([string]$text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail([string]$text) { Write-Host "`nSTOPPED: $text" -ForegroundColor Red; exit 1 }
function Invoke-Checked([string]$what, [scriptblock]$command) {
  & $command
  if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE). See the output above." }
}

Step "Checking Node.js and PostgreSQL"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "Node.js is not installed. Install it with: winget install OpenJS.NodeJS.LTS  (then open a new PowerShell)" }
$nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) { Fail "Node.js $(node -v) is too old; version 20 or newer is needed." }
$psql = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
  Sort-Object { [int]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (-not $psql) { Fail "PostgreSQL is not installed. Install it with: winget install PostgreSQL.PostgreSQL.17  (remember the password you give the postgres user)" }
Write-Host "Node.js $(node -v), PostgreSQL $($psql.Directory.Parent.Name)"

Step "Database connection (.env)"
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
  Write-Host ".env already exists; keeping it."
  $url = (Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1) -replace '^\s*DATABASE_URL\s*=\s*"?([^"]*)"?\s*$', '$1'
  if (-not $url) { Fail ".env has no DATABASE_URL line." }
  # Same hand parse as backup-db.ps1: [Uri] chokes on "@" in a password and prints it.
  if ($url -notmatch '^postgres(?:ql)?://([^:/]+):(.*)@([^@/:]+)(?::(\d+))?/([^?]+)') { Fail "DATABASE_URL in .env is not a postgresql://user:password@host/db URL." }
  $DbUser = $Matches[1]; $plain = [Uri]::UnescapeDataString($Matches[2]); $DbHost = $Matches[3]
  if ($Matches[4]) { $DbPort = [int]$Matches[4] }
  $DbName = $Matches[5]
} else {
  $secure = Read-Host "Password of the PostgreSQL '$DbUser' user (set when PostgreSQL was installed)" -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuth([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if (-not $plain) { Fail "No password entered." }
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  $encoded = [Uri]::EscapeDataString($plain)
  $lines = @(
    "# Written by scripts\install.ps1. Keep this file private: it holds the database password.",
    "DATABASE_URL=`"postgresql://${DbUser}:$encoded@${DbHost}:$DbPort/$DbName`"",
    "",
    "# Signs login sessions. Changing it signs everyone out.",
    "AUTH_SECRET=`"$secret`"",
    "AUTH_TRUST_HOST=true"
  )
  # UTF-8 without a BOM: a BOM in front of the first line breaks some .env readers.
  [IO.File]::WriteAllLines($envFile, $lines, (New-Object Text.UTF8Encoding $false))
  Write-Host ".env written."
}

Step "Creating the database if needed"
# Through the environment so the password never shows in a process list.
$env:PGPASSWORD = $plain
$exists = & $psql.FullName -h $DbHost -p $DbPort -U $DbUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DbName'"
if ($LASTEXITCODE -ne 0) { Fail "Could not connect to PostgreSQL. Check that the service is running and the password is right (delete .env to type it again)." }
if ($exists -ne "1") {
  Invoke-Checked "Creating the database" { & $psql.FullName -h $DbHost -p $DbPort -U $DbUser -d postgres -c "CREATE DATABASE `"$DbName`"" }
} else {
  Write-Host "Database '$DbName' already exists; keeping its data."
}
Remove-Item Env:PGPASSWORD

Step "Installing packages (a few minutes the first time)"
Invoke-Checked "npm ci" { npm.cmd ci --no-audit --no-fund }

Step "Preparing the database tables"
Invoke-Checked "prisma generate" { npx.cmd prisma generate }
Invoke-Checked "prisma migrate deploy" { npx.cmd prisma migrate deploy }

Step "Building the app"
Invoke-Checked "npm run build" { npm.cmd run build }

Step "Auto-start and nightly backup"
if (-not $BackupDir) {
  # A second drive survives a reinstall of Windows better than C:.
  $BackupDir = if (Test-Path "E:\") { "E:\pos-backups" } elseif (Test-Path "D:\") { "D:\pos-backups" } else { "C:\pos-backups" }
}
& (Join-Path $PSScriptRoot "install-tasks.ps1") -BackupTime $BackupTime -BackupDir $BackupDir
Start-ScheduledTask -TaskName "Hardware POS server"

Write-Host "`nDone. Backups go to $BackupDir every day at $BackupTime." -ForegroundColor Green
Write-Host "Open http://localhost:3000 in a minute and fill in the setup screen (shop details and the owner's login)." -ForegroundColor Green
Write-Host "Phones and other computers: docs\phone-access.md" -ForegroundColor Green
