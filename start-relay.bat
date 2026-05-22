@echo off
cd /d "%~dp0"
echo Installing dependencies if needed...
call npm install
echo.
echo Starting payment relay (keep this window open)...
call npm run relay
