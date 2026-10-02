#Requires -RunAsAdministrator
# Re-registers "MagnumB2B Bridge" and "MagnumB2B ngrok" to run under a built-in account that needs
# no password and no "Log on as a batch job" grant, starts both, and verifies local + public /health.
#   powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\fix-tasks.ps1
# Default: NT AUTHORITY\LOCAL SERVICE (minimal rights). -RunAs System is possible but NOT recommended
# on a domain controller exposed through ngrok (SYSTEM on a DC = control of the whole domain).
param(
  [ValidateSet('LocalService', 'System')][string]$RunAs = 'LocalService',
  [string]$Root = 'C:\MagnumB2B',
  [string]$Domain = 'flagstone-crumpled-refueling.ngrok-free.dev'
)
$ErrorActionPreference = 'Stop'
$repo = Join-Path $Root 'repo'
$logs = Join-Path $repo 'logs'
$node = (Get-Command node -ErrorAction Stop).Source
$ngrok = Join-Path $Root 'tools\ngrok.exe'
$config = Join-Path $Root 'ngrok.yml'
$account = @{ LocalService = 'NT AUTHORITY\LOCAL SERVICE'; System = 'NT AUTHORITY\SYSTEM' }[$RunAs]
$sid = @{ LocalService = '*S-1-5-19'; System = '*S-1-5-18' }[$RunAs]

"--- before"
Get-ScheduledTask -TaskName 'MagnumB2B*' | ForEach-Object {
  $i = $_ | Get-ScheduledTaskInfo
  '{0,-18} {1,-8} user={2} last={3} result=0x{4:X}' -f $_.TaskName, $_.State, $_.Principal.UserId, $i.LastRunTime, $i.LastTaskResult
}

# File access for the account (SYSTEM already has it via the earlier ACLs).
New-Item -ItemType Directory -Force $logs | Out-Null
icacls $repo /grant "${sid}:(OI)(CI)RX" /T /Q | Out-Null
icacls (Join-Path $Root 'tools') /grant "${sid}:(OI)(CI)RX" /Q | Out-Null
icacls $logs /grant "${sid}:(OI)(CI)M" /Q | Out-Null
icacls (Join-Path $repo '.env.local') /grant "${sid}:R" /Q | Out-Null
icacls $config /grant "${sid}:R" /Q | Out-Null

$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType ServiceAccount -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$trigger = New-ScheduledTaskTrigger -AtStartup
$tasks = [ordered]@{
  # Wrappers loop: any exit (crash, port still busy, log still locked during a restart) -> start again
  # after ~5 s. Task Scheduler alone does not restart an action that exits with an error code.
  'MagnumB2B Bridge' = New-ScheduledTaskAction -Execute 'cmd.exe' `
    -Argument "/c `"$repo\deploy\run-bridge.cmd`"" -WorkingDirectory $repo
  'MagnumB2B ngrok'  = New-ScheduledTaskAction -Execute 'cmd.exe' `
    -Argument "/c `"$repo\deploy\run-ngrok.cmd`"" -WorkingDirectory $Root
}
if (-not (Test-Path $node) -or -not (Test-Path $ngrok)) { throw "node or ngrok not found ($node / $ngrok)" }
foreach ($name in $tasks.Keys) {
  Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $name -Action $tasks[$name] -Trigger $trigger -Settings $settings `
    -Principal $principal -Force | Out-Null
  Start-ScheduledTask -TaskName $name
  Start-Sleep -Seconds 5
}

"--- after"
Get-ScheduledTask -TaskName 'MagnumB2B*' | ForEach-Object {
  $i = $_ | Get-ScheduledTaskInfo
  '{0,-18} {1,-8} user={2} result=0x{3:X}' -f $_.TaskName, $_.State, $_.Principal.UserId, $i.LastTaskResult
}
"--- local /health"
try { Invoke-RestMethod http://127.0.0.1:8787/health | ConvertTo-Json -Compress } catch { "FAILED: $($_.Exception.Message)"; Get-Content (Join-Path $logs 'bridge.log') -Tail 15 -ErrorAction SilentlyContinue }
"--- public /health"
Start-Sleep -Seconds 5
try { Invoke-RestMethod "https://$Domain/health" -Headers @{ 'ngrok-skip-browser-warning' = '1' } | ConvertTo-Json -Compress }
catch { "FAILED: $($_.Exception.Message)"; Get-Content (Join-Path $logs 'ngrok.log') -Tail 15 -ErrorAction SilentlyContinue }
