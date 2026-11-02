@echo off
title 2CE COFFEE ROASTERY - KHOI DONG HE THONG
chcp 65001 >nul
color 0A
cls
echo =====================================================================
echo    ☕ 2CE COFFEE ROASTERY - HE THONG XEP LICH CA LAM VIEC
echo =====================================================================
echo.
echo [*] Dang khoi dong may chu Backend RESTful API va Engine Tu Dong Hoa...
cd /d "%~dp0"

:: Tu dong mo trinh duyet sau 1 giay
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:5000"

:: Khoi chay Node.js Server
node server.js

pause

