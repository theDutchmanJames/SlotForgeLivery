@echo off
rem Build the Windows portable app and installer (x64).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then run this builder again.
  pause
  exit /b 1
)
node scripts\build-desktop.cjs windows %*
