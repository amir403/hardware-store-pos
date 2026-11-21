# Starts the production server on port 3000 (run by the "Hardware POS server"
# scheduled task at logon). Needs a fresh `npm run build` after every code update.
$root = Split-Path $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force logs | Out-Null
cmd /c "npm.cmd start >> logs\server.log 2>&1"
