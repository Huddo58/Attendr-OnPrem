@echo off
cd /d "%~dp0"

set NODE_ENV=production

echo NODE VERSION:
runtime\node.exe -v
echo ABI:
runtime\node.exe -p "process.versions.modules"
echo NODE PATH:
runtime\node.exe -p "process.execPath"
echo -----------------------------------

runtime\node.exe app\server.js

if %errorlevel% neq 0 (
    echo.
    echo Attendr exited with error code %errorlevel%.
)

pause