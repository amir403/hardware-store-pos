# Registers the two Windows scheduled tasks for this shop computer. Safe to run
# again: it replaces the tasks. Run once: powershell -ExecutionPolicy Bypass -File scripts\install-tasks.ps1
param([string]$BackupTime = "22:00")
$ErrorActionPreference = "Stop"
$scripts = $PSScriptRoot
$user = "$env:USERDOMAIN\$env:USERNAME"

function New-PsAction([string]$file) {
  New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scripts\$file`"" `
    -WorkingDirectory (Split-Path $scripts)
}

# The app: starts at logon, runs with no time limit, restarts if it crashes.
Register-ScheduledTask -TaskName "Hardware POS server" -Force `
  -Action (New-PsAction "start-pos.ps1") `
  -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) `
  -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) | Out-Null

# The backup: nightly; if the computer was off at that time, runs when it next starts.
Register-ScheduledTask -TaskName "Hardware POS backup" -Force `
  -Action (New-PsAction "backup-db.ps1") `
  -Trigger (New-ScheduledTaskTrigger -Daily -At $BackupTime) `
  -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) | Out-Null

Get-ScheduledTask -TaskName "Hardware POS*" | Select-Object TaskName, State
