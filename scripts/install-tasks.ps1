# Registers the two Windows scheduled tasks for this shop computer. Safe to run
# again: it replaces the tasks. Run once: powershell -ExecutionPolicy Bypass -File scripts\install-tasks.ps1
param([string]$BackupTime = "22:00", [string]$BackupDir = "E:\pos-backups")
$ErrorActionPreference = "Stop"
$scripts = $PSScriptRoot
$user = "$env:USERDOMAIN\$env:USERNAME"

function New-PsAction([string]$file, [string]$extra = "") {
  New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scripts\$file`" $extra" `
    -WorkingDirectory (Split-Path $scripts)
}

# The app: starts at logon, runs with no time limit. Windows can still end it
# (sleep, log-off), and restart-on-failure does not cover a killed process, so
# a 5-minute trigger acts as a watchdog: IgnoreNew skips it while the server runs.
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
  -RepetitionInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName "Hardware POS server" -Force `
  -Action (New-PsAction "start-pos.ps1") `
  -Trigger @((New-ScheduledTaskTrigger -AtLogOn -User $user), $watchdog) `
  -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew -StartWhenAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) | Out-Null

# The backup: nightly; if the computer was off at that time, runs when it next starts.
Register-ScheduledTask -TaskName "Hardware POS backup" -Force `
  -Action (New-PsAction "backup-db.ps1" "-Dir `"$BackupDir`"") `
  -Trigger (New-ScheduledTaskTrigger -Daily -At $BackupTime) `
  -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries) | Out-Null

Get-ScheduledTask -TaskName "Hardware POS*" | Select-Object TaskName, State
