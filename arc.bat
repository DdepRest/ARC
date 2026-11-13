@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM Generate timestamp using PowerShell
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "Get-Date -Format 'yyMMdd_HHmmss'"`) do set "timestamp=%%a"

REM Create logs folders if they do not exist
if not exist "logs\console" mkdir "logs\console"
if not exist "logs\dialogs" mkdir "logs\dialogs"

REM Start application and stream output strictly to log file (for performance)
set "logfile=logs\console\arc_!timestamp!.log"
echo Starting A.R.C. in silent mode... 
echo Logs are being saved to: !logfile!
echo.
echo Application is running. Console output is disabled to improve performance.

REM Run the app and redirect ALL output to the log file
call start_app.bat > "!logfile!" 2>&1
set EXIT_CODE=!errorlevel!

echo.
if !EXIT_CODE! neq 0 (
    echo [ERROR] Application exited with error code !EXIT_CODE!
    echo [ERROR] Last 20 lines of the log:
    echo ----------------------------------------------------
    powershell -NoProfile -Command "if (Test-Path '!logfile!') { Get-Content '!logfile!' -Tail 20 }"
    echo ----------------------------------------------------
    echo Please check the full log file for details: !logfile!
) else (
    echo A.R.C. has exited normally. Full log: !logfile!
)
pause

