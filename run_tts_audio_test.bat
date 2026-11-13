@echo off
setlocal
echo ====================================================
echo A.R.C. - RUNNING TTS HOMOGRAPHS AUDIO TEST (28 WAV)
echo ====================================================

REM Ensure main app/server is not causing CPU contention
echo [NOTICE] Ensure that A.R.C. and silero_server.py are not running
echo          to avoid CPU contention between multiple PyTorch instances.
echo.

if not exist "silero_env\Scripts\activate.bat" (
    echo [ERROR] Virtual environment 'silero_env' not found!
    echo Please run setup_silero.bat first.
    pause
    exit /b 1
)

echo Activating silero_env...
call silero_env\Scripts\activate.bat

echo Running test harness...
python scripts\tts_homographs_audio_test.py

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ====================================================
    echo Test completed successfully! Opening tts_test folder...
    echo ====================================================
    if exist "tts_test" (
        explorer tts_test
    )
) else (
    echo.
    echo [ERROR] Test script exited with error code %ERRORLEVEL%.
)

pause
