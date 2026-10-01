#Requires -RunAsAdministrator
# Runs the bridge (bridge/server.js) at boot under the low-privilege user, as a scheduled task
# (no third-party service wrapper needed). Re-run any time; it replaces the task.
#   powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\install-service.ps1
param(
  [string]$User = "$env:USERDOMAIN\claudeapp",
  [string]$Repo = 'C:\MagnumB2B\repo',
  [string]$TaskName = 'MagnumB2B Bridge'
)
$ErrorActionPreference = 'Stop'

$node = (Get-Command node -ErrorAction Stop).Source
$logs = Join-Path $Repo 'logs'
$envFile = Join-Path $Repo '.env.local'
if (-not (Test-Path $envFile)) { throw ".env.local not found in $Repo" }
New-Item -ItemType Directory -Force $logs | Out-Null

# The service user may read/execute the code and write only the logs folder.
icacls $Repo /grant "${User}:(OI)(CI)RX" /T /Q | Out-Null
icacls $logs /grant "${User}:(OI)(CI)M" /Q | Out-Null
# Secrets: only Administrators, SYSTEM and the service user can read .env.local.
icacls $envFile /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' "${User}:R" /Q | Out-Null

$cred = Get-Credential -UserName $User -Message "Password of $User (stored by Task Scheduler only)"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' `
  -Argument "/c `"`"$node`" bridge\server.js >> logs\bridge.log 2>&1`"" -WorkingDirectory $Repo
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 4
try {
  Invoke-RestMethod http://127.0.0.1:8787/health
  "OK - '$TaskName' is running as $User. Log: $logs\bridge.log"
} catch {
  "Task registered but /health did not answer yet - check $logs\bridge.log and Task Scheduler history."
}
