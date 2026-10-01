#Requires -RunAsAdministrator
# Installs cloudflared and runs the named tunnel as a Windows service.
# The tunnel itself (name, public hostname -> http://127.0.0.1:8787) is created in the Cloudflare
# dashboard, which gives the token passed here. See deploy/README.md.
#   powershell -ExecutionPolicy Bypass -File C:\MagnumB2B\repo\deploy\install-tunnel.ps1 -Token <token>
param([Parameter(Mandatory)][string]$Token)
$ErrorActionPreference = 'Stop'

$candidates = @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe")
$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
  $msi = Join-Path $env:TEMP 'cloudflared-windows-amd64.msi'
  Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi' -OutFile $msi
  Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn" -Wait
  $exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $exe) { throw 'cloudflared install failed' }
}
& $exe --version
& $exe service install $Token
Start-Sleep -Seconds 5
Get-Service cloudflared | Format-Table Name, Status, StartType -AutoSize
'Tunnel service installed. Check the tunnel shows HEALTHY in the Cloudflare dashboard, then call https://<hostname>/health'
