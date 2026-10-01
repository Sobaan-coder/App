@echo off
REM Double-click to install KHOKHAR on this Windows PC (runs install.ps1).
cd /d "%~dp0\..\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
pause
