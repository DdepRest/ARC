@echo off
echo ====================================================
echo Setting up Silero TTS Python Environment...
echo ====================================================

if not exist "silero_env" (
    python -m venv silero_env
)

call silero_env\Scripts\activate.bat

echo Installing dependencies from requirements-silero.txt...
pip install -r requirements-silero.txt

echo Silero TTS environment ready.
