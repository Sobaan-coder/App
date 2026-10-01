@echo off
REM Double-click to start KHOKHAR (AI Command Center), then open http://localhost:3000
cd /d "%~dp0\..\.."
title KHOKHAR - AI Command Center
echo Starting KHOKHAR... keep this window open. Open http://localhost:3000 in your browser.
call npm start
pause
