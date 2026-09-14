@echo off
title MM2 SHOP Server
cd /d "%~dp0"
set "ADMIN_PASSWORD=12345"
echo.
echo ========================================
echo           MM2 SHOP SERVER
echo ========================================
echo.
echo Shop:  http://localhost:3000
echo Admin: http://localhost:3000/admin
echo Password: 12345
echo.
echo Do not close this window while the shop is running.
echo.
start "" "http://localhost:3000"
node .\server.js
pause
