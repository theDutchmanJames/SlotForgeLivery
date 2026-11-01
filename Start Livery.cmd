@echo off
if exist "%~dp0dist\v1.0.0\SlotForgeLivery-1.0.0-windows-x64.exe" (
  start "" "%~dp0dist\v1.0.0\SlotForgeLivery-1.0.0-windows-x64.exe"
) else if exist "%~dp0dist\SlotForge Livery 1.0\SlotForge Livery.exe" (
  start "" "%~dp0dist\SlotForge Livery 1.0\SlotForge Livery.exe"
) else (
  echo Download SlotForge Livery from https://github.com/theDutchmanJames/SlotForgeLivery/releases/latest
  pause
)
