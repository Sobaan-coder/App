@echo off
REM Double-click to start KHOKHAR: server in the background + the KHOKHAR window.
REM (To see the server output in this window instead, run:  npm start)
cd /d "%~dp0\..\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0khokhar.ps1" %*
if errorlevel 1 pause
