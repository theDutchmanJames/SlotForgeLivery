@echo off
rem Reuse matching dependencies and skip checks for a previously checked build.
call "%~dp0build-windows.cmd" --quick %*
