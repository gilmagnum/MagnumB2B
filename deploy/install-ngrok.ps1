#Requires -RunAsAdministrator
# Public HTTPS URL for the bridge on Gil's free ngrok static domain, running at boot under the
# low-privilege user (scheduled task, like install-service.ps1). Re-run any time; it replaces the task.
#   powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\install-ngrok.ps1 -Domain <name>.ngrok-free.app
# The authtoken is asked for interactively (ngrok dashboard -> Your Authtoken) and stored only in ngrok.yml.
param(
  [Parameter(Mandatory)][string]$Domain,
  [string]$User = "$env:USERDOMAIN\claudeapp",
  [string]$Root = 'C:\MagnumB2B',
  [string]$TaskName = 'MagnumB2B ngrok',
  [int]$Port = 8787
)
$ErrorActionPreference = 'Stop'

$Domain = $Domain -replace '^https?://', '' -replace '/.*$', ''
$exe = Join-Path $Root 'tools\ngrok.exe'
$config = Join-Path $Root 'ngrok.yml'
$logs = Join-Path $Root 'repo\logs'
if (-not (Test-Path $exe)) { throw "ngrok.exe not found at $exe" }
New-Item -ItemType Directory -Force $logs | Out-Null

$token = Read-Host -AsSecureString 'ngrok authtoken'
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($token))
@"
version: "2"
authtoken: $plain
tunnels:
  bridge:
    proto: http
    addr: 127.0.0.1:$Port
    domain: $Domain
"@ | Set-Content -Path $config -Encoding ascii
& $exe config check --config $config
if ($LASTEXITCODE) { throw 'ngrok config check failed' }

# Secrets: only Administrators, SYSTEM and the service user can read ngrok.yml.
icacls $config /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' "${User}:R" /Q | Out-Null
icacls (Join-Path $Root 'tools') /grant "${User}:(OI)(CI)RX" /Q | Out-Null
icacls $logs /grant "${User}:(OI)(CI)M" /Q | Out-Null

$cred = Get-Credential -UserName $User -Message "Password of $User (stored by Task Scheduler only)"
$action = New-ScheduledTaskAction -Execute $exe `
  -Argument "start --all --config `"$config`" --log `"$logs\ngrok.log`" --log-format logfmt" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 6
try {
  $h = Invoke-RestMethod "https://$Domain/health" -Headers @{ 'ngrok-skip-browser-warning' = '1' }
  "OK - https://$Domain/health -> $($h | ConvertTo-Json -Compress)"
} catch {
  "Task started but https://$Domain/health did not answer yet ($($_.Exception.Message)). Is the bridge task running? Log: $logs\ngrok.log"
}
