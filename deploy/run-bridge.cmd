@echo off
rem Runs the bridge forever: if node exits (crash, port still busy, log file still locked during a
rem restart), wait ~5 seconds and start again. Used by the "MagnumB2B Bridge" scheduled task.
rem (ping is the delay because "timeout" needs a console, which a scheduled task doesn't have.)
cd /d "%~dp0.."
if not exist logs mkdir logs
if not defined BRIDGE_LOG set "BRIDGE_LOG=logs\bridge.log"
:loop
"%ProgramFiles%\nodejs\node.exe" bridge\server.js >> "%BRIDGE_LOG%" 2>&1
>> logs\bridge-restarts.log echo %date% %time% bridge exited with code %errorlevel%, restarting in 5s
ping -n 6 127.0.0.1 >nul
goto loop
