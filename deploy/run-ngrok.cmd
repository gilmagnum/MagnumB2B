@echo off
rem Runs ngrok forever (restarts ~5 seconds after any exit). Used by the "MagnumB2B ngrok" scheduled task.
cd /d "%~dp0..\.."
:loop
"%~dp0..\..\tools\ngrok.exe" start --all --config ngrok.yml --log repo\logs\ngrok.log --log-format logfmt
ping -n 6 127.0.0.1 >nul
goto loop
