@echo off
chcp 65001 >nul
title A.R.C. Cognitive Platform
echo ====================================================
echo  A.R.C. COGNITIVE PLATFORM - SYSTEM STARTUP
echo ====================================================
echo.

set REPAIR=0
if "%1"=="--repair" set REPAIR=1
if "%1"=="-r" set REPAIR=1

echo [START] System initialization sequence initiated at: %time%
echo.

rem 1. Check for Node.js / npm
echo [1/3] Verifying Node.js environment... [%time%]
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js / npm was not found on your system!
    echo Please install Node.js LTS version from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [SUCCESS] Node.js environment is present.
echo.

rem 2. Install Node dependencies if missing or requested
echo [2/3] Verifying Node.js dependencies... [%time%]
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Running npm install...
    set REPAIR=1
)

if "%REPAIR%"=="1" (
    echo [INFO] Installing/repairing Node.js dependencies... [%time%]
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] npm install failed. Please make sure you are online and try again.
        echo.
        pause
        exit /b 1
    )
    echo [SUCCESS] Node.js dependencies installed successfully. [%time%]
    
    echo [INFO] Rebuilding native modules for Electron... [%time%]
    call npm run rebuild:electron
    if errorlevel 1 (
        echo [WARN] Native module rebuild failed. DatabaseService might use JSON fallback. [%time%]
    ) else (
        echo [SUCCESS] Native modules rebuilt successfully for Electron. [%time%]
    )
) else (
    echo [SUCCESS] Node.js dependencies verified [node_modules found, skipping npm install].
)
echo.

rem 4. Ensure models are downloaded
echo [3.5/4] Verifying model files... [%time%]
node scripts/download_models.js
if errorlevel 1 (
    echo [ERROR] Model verification or download failed!
    echo Please check your network connection and try again.
    echo.
    pause
    exit /b 1
)
echo [SUCCESS] Model files verified. [%time%]
echo.

rem 4.5. Verify Python TTS Environment
echo [3.6/4] Verifying Python TTS environment... [%time%]
if not exist "silero_env\Scripts\python.exe" (
    echo [INFO] Python virtual environment not found. Running setup_silero.bat... [%time%]
    call setup_silero.bat
) else (
    "silero_env\Scripts\python.exe" -c "import torch, scipy, soundfile, flask, onnxruntime, ruaccent" >nul 2>&1
    if errorlevel 1 (
        echo [INFO] Installing/updating Python TTS packages ^(ruaccent, onnxruntime^)... [%time%]
        call setup_silero.bat
    ) else (
        echo [SUCCESS] Python TTS virtual environment is present and verified.
    )
)
echo.

rem 5. Run the app
echo [3/3] Starting A.R.C. application... [%time%]
echo ====================================================
echo.
echo Launching Electron Frontend... [%time%]
echo.
echo Application is running. Close this window to exit.
echo.
call npm run electron:dev
